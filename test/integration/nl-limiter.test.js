/**
 * @jest-environment node
 */

// Exercises the Postgres-backed, cross-instance guards for the natural-language
// search OpenAI call. The point of this table-backed limiter is that state is
// shared across Lambda instances; here we drive it directly against the real DB
// with deterministic `now` values (no reliance on wall-clock timing).

import models from '../../src/models';
import {
  allowInWindow,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  limiterConfig,
} from '../../src/controllers/nl-limiter';

const {
  windowMs, maxRequests, cbFailureThreshold, cbOpenMs,
} = limiterConfig;

describe('nl-limiter (shared Postgres guards)', () => {
  beforeEach(async () => {
    await models.OpenaiRateLimitState.destroy({ where: {}, truncate: true });
  });

  describe('fixed-window rate limit', () => {
    it('allows up to the cap within a window, then denies', async () => {
      const now = 1000000;

      for (let i = 0; i < maxRequests; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect(await allowInWindow(now)).toBe(true);
      }

      expect(await allowInWindow(now)).toBe(false);
    });

    it('resets and allows again once the window has elapsed', async () => {
      const now = 1000000;
      for (let i = 0; i < maxRequests; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await allowInWindow(now);
      }
      expect(await allowInWindow(now)).toBe(false);

      expect(await allowInWindow(now + windowMs)).toBe(true);
    });

    it('shares the counter across calls (no per-caller reset)', async () => {
      const now = 2000000;
      // Two independent bursts against the same shared row should accumulate.
      await allowInWindow(now);
      const row = await models.OpenaiRateLimitState.findByPk('nl_query');
      expect(Number(row.window_count)).toBe(1);

      await allowInWindow(now);
      await row.reload();
      expect(Number(row.window_count)).toBe(2);
    });
  });

  describe('circuit breaker', () => {
    it('stays closed below the failure threshold', async () => {
      const now = 5000000;
      for (let i = 0; i < cbFailureThreshold - 1; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await recordFailure(now);
      }
      expect(await isCircuitOpen(now)).toBe(false);
    });

    it('opens after consecutive failures reach the threshold', async () => {
      const now = 5000000;
      for (let i = 0; i < cbFailureThreshold; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await recordFailure(now);
      }
      expect(await isCircuitOpen(now)).toBe(true);
    });

    it('closes again after the cooldown elapses', async () => {
      const now = 5000000;
      for (let i = 0; i < cbFailureThreshold; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await recordFailure(now);
      }
      expect(await isCircuitOpen(now)).toBe(true);
      expect(await isCircuitOpen(now + cbOpenMs)).toBe(false);
    });

    it('resets the failure count on success', async () => {
      const now = 5000000;
      for (let i = 0; i < cbFailureThreshold - 1; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await recordFailure(now);
      }
      await recordSuccess();

      // One more failure must not open the breaker now that the count reset.
      await recordFailure(now);
      expect(await isCircuitOpen(now)).toBe(false);
    });
  });
});
