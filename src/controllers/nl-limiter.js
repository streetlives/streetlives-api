/* eslint-disable no-console */

// Cross-instance abuse/availability controls for the paid OpenAI
// natural-language-search call. In Lambda every concurrent instance is its own
// process, so in-memory counters only limit a single instance; the public
// endpoint could still be amplified across many warm instances. This module
// keeps the fixed-window rate counters and circuit-breaker state in Postgres
// (shared by all instances) and mutates them atomically.
//
// Admission checks (isCircuitOpen, allowInWindow, allowClientInWindow) fail
// CLOSED: if the shared store is unavailable we log and DENY the call, so a
// DB outage degrades to "natural-language search is temporarily unavailable"
// (the caller falls back to plain keyword search) rather than letting Lambda
// concurrency amplify unbounded, unmetered OpenAI calls. recordSuccess/
// recordFailure run after the upstream call has already happened — they are
// best-effort bookkeeping, not admission decisions, so they stay fail-open
// (log and continue) rather than failing the request that already completed.

import crypto from 'crypto';
import models from '../models';

const { sequelize } = models;

const GLOBAL_KEY = 'nl_query';

// Fixed-window global rate limit (total uncached OpenAI calls across instances).
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;

// Fixed-window per-client rate limit, so a single caller cannot consume the
// entire global budget above and starve every other user of NL parsing.
const CLIENT_WINDOW_MS = 60 * 1000;
const CLIENT_MAX_REQUESTS = 8;

// Circuit breaker: stop hammering OpenAI globally while it is failing.
const CB_FAILURE_THRESHOLD = 5;
const CB_OPEN_MS = 60 * 1000;

// Retention bound for per-client rows. A client row is a single-window
// counter: once its window has elapsed it carries no admission state (the
// next request resets it anyway), but each row's key is derived from a client
// identifier, so leaving rows behind would grow the table without bound on a
// public endpoint and retain pseudonymous client identifiers indefinitely.
// Expired rows are swept opportunistically from the admission path (no
// scheduled job exists on Lambda): a cheap prefix-indexed DELETE, gated to at
// most once per CLEANUP_INTERVAL_MS per instance. Worst-case retention is
// therefore CLIENT_ROW_TTL_MS plus one sweep interval plus however long the
// endpoint goes without any NL traffic.
const CLIENT_ROW_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Exposed for tests to assert against without duplicating the magic numbers.
export const limiterConfig = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
  clientWindowMs: CLIENT_WINDOW_MS,
  clientMaxRequests: CLIENT_MAX_REQUESTS,
  cbFailureThreshold: CB_FAILURE_THRESHOLD,
  cbOpenMs: CB_OPEN_MS,
  clientRowTtlMs: CLIENT_ROW_TTL_MS,
  cleanupIntervalMs: CLEANUP_INTERVAL_MS,
};

// The shared table's primary key is free-text (see the migration), so a raw
// per-client identifier (typically an IP) would work directly. Hash it so we
// never store raw IPs in this table and so the key has a bounded, predictable
// size regardless of what identifies the client. The hash is additionally
// scoped to the UTC day: an unsalted hash of an IPv4 address is trivially
// reversible by enumerating the address space, so a stable hash would be a
// persistent pseudonymous identifier. Mixing the day in means a leaked or
// not-yet-swept row only de-pseudonymizes to (ip, that one day) and cannot be
// linked across days. Deterministic (no shared salt state) so every Lambda
// instance derives the same key. Side effect: a client's window resets at the
// UTC day boundary — one extra window per day is negligible against an
// 8/minute cap.
const DAY_MS = 24 * 60 * 60 * 1000;
const clientKey = (clientId, now) => {
  const dayBucket = Math.floor(now / DAY_MS);
  const hash = crypto.createHash('sha256')
    .update(`${dayBucket}:${clientId}`)
    .digest('hex')
    .slice(0, 32);
  return `nl_query:client:${hash}`;
};

// Delete per-client rows whose window ended more than CLIENT_ROW_TTL_MS ago.
// Never touches the single global row (its key has no client prefix).
export const cleanupExpiredClientRows = async (now = Date.now()) => {
  await sequelize.query(`
    DELETE FROM openai_rate_limit_state
    WHERE key LIKE 'nl_query:client:%' AND window_start < :cutoff;
  `, { replacements: { cutoff: now - CLIENT_ROW_TTL_MS } });
};

let lastCleanupAt = 0;
const maybeCleanupClientRows = async (now) => {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    await cleanupExpiredClientRows(now);
  } catch (err) {
    // Best-effort housekeeping: a failed sweep must not affect the admission
    // decision that already happened; the next sweep will catch up.
    console.warn(`NL limiter: expired client-row cleanup failed: ${err.message}`);
  }
};

// Atomically reset-or-increment a fixed window for `key` and return whether
// this call fits under `maxRequests`. A single UPSERT keeps the
// read-modify-write race-free across instances: the window is reset when it
// has elapsed, otherwise the counter is bumped, and the post-increment count
// decides admission.
const checkWindow = async (key, windowMs, maxRequests, now) => {
  const [rows] = await sequelize.query(`
    INSERT INTO openai_rate_limit_state
      (key, window_start, window_count, cb_failures, cb_opened_at)
    VALUES (:key, :now, 1, 0, 0)
    ON CONFLICT (key) DO UPDATE SET
      window_count = CASE
        WHEN :now - openai_rate_limit_state.window_start >= :windowMs THEN 1
        ELSE openai_rate_limit_state.window_count + 1 END,
      window_start = CASE
        WHEN :now - openai_rate_limit_state.window_start >= :windowMs THEN :now
        ELSE openai_rate_limit_state.window_start END
    RETURNING window_count;
  `, { replacements: { key, now, windowMs } });
  return Number(rows[0].window_count) <= maxRequests;
};

export const allowInWindow = async (now = Date.now()) => {
  try {
    return await checkWindow(GLOBAL_KEY, WINDOW_MS, MAX_REQUESTS, now);
  } catch (err) {
    console.warn(`NL limiter: global rate-limit check failed, denying: ${err.message}`);
    return false;
  }
};

export const allowClientInWindow = async (clientId, now = Date.now()) => {
  try {
    const allowed =
      await checkWindow(clientKey(clientId, now), CLIENT_WINDOW_MS, CLIENT_MAX_REQUESTS, now);
    await maybeCleanupClientRows(now);
    return allowed;
  } catch (err) {
    console.warn(`NL limiter: per-client rate-limit check failed, denying: ${err.message}`);
    return false;
  }
};

export const isCircuitOpen = async (now = Date.now()) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT cb_opened_at FROM openai_rate_limit_state WHERE key = :key',
      { replacements: { key: GLOBAL_KEY } },
    );
    if (!rows.length) return false;
    const openedAt = Number(rows[0].cb_opened_at);
    return openedAt > 0 && now - openedAt < CB_OPEN_MS;
  } catch (err) {
    console.warn(`NL limiter: circuit check failed, treating as open: ${err.message}`);
    return true;
  }
};

export const recordSuccess = async () => {
  try {
    await sequelize.query(`
      INSERT INTO openai_rate_limit_state
        (key, window_start, window_count, cb_failures, cb_opened_at)
      VALUES (:key, 0, 0, 0, 0)
      ON CONFLICT (key) DO UPDATE SET cb_failures = 0, cb_opened_at = 0;
    `, { replacements: { key: GLOBAL_KEY } });
  } catch (err) {
    console.warn(`NL limiter: recording success failed: ${err.message}`);
  }
};

export const recordFailure = async (now = Date.now()) => {
  try {
    await sequelize.query(`
      INSERT INTO openai_rate_limit_state
        (key, window_start, window_count, cb_failures, cb_opened_at)
      VALUES (:key, :now, 0, 1, 0)
      ON CONFLICT (key) DO UPDATE SET
        cb_failures = openai_rate_limit_state.cb_failures + 1,
        cb_opened_at = CASE
          WHEN openai_rate_limit_state.cb_failures + 1 >= :threshold THEN :now
          ELSE openai_rate_limit_state.cb_opened_at END;
    `, { replacements: { key: GLOBAL_KEY, now, threshold: CB_FAILURE_THRESHOLD } });
  } catch (err) {
    console.warn(`NL limiter: recording failure failed: ${err.message}`);
  }
};
