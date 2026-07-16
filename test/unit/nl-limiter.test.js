/**
 * @jest-environment node
 */

// Admission checks (allowInWindow, allowClientInWindow, isCircuitOpen) must fail
// CLOSED: when the Postgres store is unavailable, natural-language search should
// be denied rather than let Lambda concurrency amplify unmetered OpenAI calls.
// recordSuccess/recordFailure run after the upstream call already happened, so
// they stay fail-open (best-effort bookkeeping). Here we mock the DB layer to
// always throw, or to return controlled rows, to assert both behaviors.

const mockQuery = jest.fn();

jest.mock('../../src/models', () => ({
  sequelize: { query: mockQuery },
}));

describe('nl-limiter', () => {
  let limiter;

  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line global-require
    limiter = require('../../src/controllers/nl-limiter');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fail-closed behavior when the shared store is unavailable', () => {
    beforeEach(() => {
      mockQuery.mockRejectedValue(new Error('db down'));
    });

    it('denies requests when the global rate-limit query fails', async () => {
      await expect(limiter.allowInWindow(1000)).resolves.toBe(false);
    });

    it('denies requests when the per-client rate-limit query fails', async () => {
      await expect(limiter.allowClientInWindow('1.2.3.4', 1000)).resolves.toBe(false);
    });

    it('treats the circuit as open when the query fails', async () => {
      await expect(limiter.isCircuitOpen(1000)).resolves.toBe(true);
    });

    it('swallows errors when recording success/failure', async () => {
      await expect(limiter.recordSuccess()).resolves.toBeUndefined();
      await expect(limiter.recordFailure(1000)).resolves.toBeUndefined();
    });
  });

  describe('allowInWindow', () => {
    it('allows the call and queries under the global key', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);

      await expect(limiter.allowInWindow(1000)).resolves.toBe(true);
      const [, options] = mockQuery.mock.calls[0];
      expect(options.replacements.key).toBe('nl_query');
    });

    it('denies once the window count exceeds the max', async () => {
      mockQuery.mockResolvedValue([[{ window_count: limiter.limiterConfig.maxRequests + 1 }]]);

      await expect(limiter.allowInWindow(1000)).resolves.toBe(false);
    });
  });

  describe('allowClientInWindow', () => {
    it('allows the call and queries under a hashed per-client key', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);

      await expect(limiter.allowClientInWindow('1.2.3.4', 1000)).resolves.toBe(true);
      const [, options] = mockQuery.mock.calls[0];
      expect(options.replacements.key).toMatch(/^nl_query:client:[0-9a-f]{32}$/);
      expect(options.replacements.key).not.toContain('1.2.3.4');
    });

    it('denies once the per-client window count exceeds the client max', async () => {
      const windowCount = limiter.limiterConfig.clientMaxRequests + 1;
      mockQuery.mockResolvedValue([[{ window_count: windowCount }]]);

      await expect(limiter.allowClientInWindow('1.2.3.4', 1000)).resolves.toBe(false);
    });

    it('hashes different clients to different keys (no shared budget)', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);

      await limiter.allowClientInWindow('1.2.3.4', 1000);
      await limiter.allowClientInWindow('5.6.7.8', 1000);

      const keyA = mockQuery.mock.calls[0][1].replacements.key;
      const keyB = mockQuery.mock.calls[1][1].replacements.key;
      expect(keyA).not.toBe(keyB);
    });

    it('scopes client hashes to the UTC day (not stable long-term identifiers)', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);
      const dayMs = 24 * 60 * 60 * 1000;

      await limiter.allowClientInWindow('1.2.3.4', 1000);
      await limiter.allowClientInWindow('1.2.3.4', 1000 + dayMs);

      const keyDay0 = mockQuery.mock.calls[0][1].replacements.key;
      const keyDay1 = mockQuery.mock.calls[1][1].replacements.key;
      expect(keyDay0).not.toBe(keyDay1);
    });
  });

  describe('expired client-row cleanup', () => {
    // A `now` far enough past the module-initial lastCleanupAt (0) to open the
    // per-instance sweep gate.
    const now = 100000;

    const deleteCalls = () =>
      mockQuery.mock.calls.filter(([sql]) => sql.includes('DELETE'));

    it('sweeps expired rows from the admission path, at most once per interval', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);

      await limiter.allowClientInWindow('1.2.3.4', now);
      await limiter.allowClientInWindow('1.2.3.4', now);

      expect(deleteCalls()).toHaveLength(1);
      const [, options] = deleteCalls()[0];
      expect(options.replacements.cutoff).toBe(now - limiter.limiterConfig.clientRowTtlMs);
    });

    it('sweeps again once the cleanup interval has elapsed', async () => {
      mockQuery.mockResolvedValue([[{ window_count: 1 }]]);

      await limiter.allowClientInWindow('1.2.3.4', now);
      await limiter.allowClientInWindow('1.2.3.4', now + limiter.limiterConfig.cleanupIntervalMs);

      expect(deleteCalls()).toHaveLength(2);
    });

    it('does not affect the admission decision when the sweep fails', async () => {
      mockQuery
        .mockResolvedValueOnce([[{ window_count: 1 }]])
        .mockRejectedValueOnce(new Error('db down'));

      await expect(limiter.allowClientInWindow('1.2.3.4', now)).resolves.toBe(true);
    });
  });

  describe('isCircuitOpen', () => {
    it('is closed when no row exists yet', async () => {
      mockQuery.mockResolvedValue([[]]);
      await expect(limiter.isCircuitOpen(1000)).resolves.toBe(false);
    });

    it('is open while within the cooldown window', async () => {
      mockQuery.mockResolvedValue([[{ cb_opened_at: 500 }]]);
      await expect(limiter.isCircuitOpen(1000)).resolves.toBe(true);
    });

    it('is closed again after the cooldown window', async () => {
      mockQuery.mockResolvedValue([[{ cb_opened_at: 500 }]]);
      const afterCooldown = 500 + limiter.limiterConfig.cbOpenMs + 1;
      await expect(limiter.isCircuitOpen(afterCooldown)).resolves.toBe(false);
    });
  });
});
