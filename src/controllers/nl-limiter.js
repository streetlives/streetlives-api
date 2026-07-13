/* eslint-disable no-console */

// Cross-instance abuse/availability controls for the paid OpenAI
// natural-language-search call. In Lambda every concurrent instance is its own
// process, so in-memory counters only limit a single instance; the public
// endpoint could still be amplified across many warm instances. This module
// keeps the fixed-window rate counter and circuit-breaker state in a single
// Postgres row (shared by all instances) and mutates it atomically.
//
// Every function fails OPEN: if the shared store is unavailable we log and let
// the request through, so a DB blip degrades to the caller's per-instance
// guards rather than disabling natural-language search entirely.

import models from '../models';

const { sequelize } = models;

const LIMITER_KEY = 'nl_query';

// Fixed-window global rate limit (total uncached OpenAI calls across instances).
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;

// Circuit breaker: stop hammering OpenAI globally while it is failing.
const CB_FAILURE_THRESHOLD = 5;
const CB_OPEN_MS = 60 * 1000;

// Exposed for tests to assert against without duplicating the magic numbers.
export const limiterConfig = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
  cbFailureThreshold: CB_FAILURE_THRESHOLD,
  cbOpenMs: CB_OPEN_MS,
};

// Atomically reset-or-increment the fixed window and return whether this call
// fits under the cap. A single UPSERT keeps the read-modify-write race-free
// across instances: the window is reset when it has elapsed, otherwise the
// counter is bumped, and the post-increment count decides admission.
export const allowInWindow = async (now = Date.now()) => {
  try {
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
    `, { replacements: { key: LIMITER_KEY, now, windowMs: WINDOW_MS } });
    return Number(rows[0].window_count) <= MAX_REQUESTS;
  } catch (err) {
    console.warn(`NL limiter: rate-limit check failed, allowing: ${err.message}`);
    return true;
  }
};

export const isCircuitOpen = async (now = Date.now()) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT cb_opened_at FROM openai_rate_limit_state WHERE key = :key',
      { replacements: { key: LIMITER_KEY } },
    );
    if (!rows.length) return false;
    const openedAt = Number(rows[0].cb_opened_at);
    return openedAt > 0 && now - openedAt < CB_OPEN_MS;
  } catch (err) {
    console.warn(`NL limiter: circuit check failed, treating as closed: ${err.message}`);
    return false;
  }
};

export const recordSuccess = async () => {
  try {
    await sequelize.query(`
      INSERT INTO openai_rate_limit_state
        (key, window_start, window_count, cb_failures, cb_opened_at)
      VALUES (:key, 0, 0, 0, 0)
      ON CONFLICT (key) DO UPDATE SET cb_failures = 0, cb_opened_at = 0;
    `, { replacements: { key: LIMITER_KEY } });
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
    `, { replacements: { key: LIMITER_KEY, now, threshold: CB_FAILURE_THRESHOLD } });
  } catch (err) {
    console.warn(`NL limiter: recording failure failed: ${err.message}`);
  }
};
