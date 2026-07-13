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

// Exposed for tests to assert against without duplicating the magic numbers.
export const limiterConfig = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
  clientWindowMs: CLIENT_WINDOW_MS,
  clientMaxRequests: CLIENT_MAX_REQUESTS,
  cbFailureThreshold: CB_FAILURE_THRESHOLD,
  cbOpenMs: CB_OPEN_MS,
};

// The shared table's primary key is free-text (see the migration), so a raw
// per-client identifier (typically an IP) would work directly. Hash it so we
// never store raw IPs in this table and so the key has a bounded, predictable
// size regardless of what identifies the client.
const clientKey = clientId =>
  `nl_query:client:${crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 32)}`;

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
    return await checkWindow(clientKey(clientId), CLIENT_WINDOW_MS, CLIENT_MAX_REQUESTS, now);
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
