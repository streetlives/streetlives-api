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
