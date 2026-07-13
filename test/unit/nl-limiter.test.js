/**
 * @jest-environment node
 */

// The shared limiter must fail OPEN: when the Postgres store is unavailable, the
// guards should not disable natural-language search — they degrade to the
// caller's per-instance limits. Here we mock the DB layer to always throw.

const mockQuery = jest.fn();

jest.mock('../../src/models', () => ({
  sequelize: { query: mockQuery },
}));

describe('nl-limiter fail-open behavior', () => {
  let limiter;

  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset().mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line global-require
    limiter = require('../../src/controllers/nl-limiter');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows requests when the rate-limit query fails', async () => {
    await expect(limiter.allowInWindow(1000)).resolves.toBe(true);
  });

  it('treats the circuit as closed when the query fails', async () => {
    await expect(limiter.isCircuitOpen(1000)).resolves.toBe(false);
  });

  it('swallows errors when recording success/failure', async () => {
    await expect(limiter.recordSuccess()).resolves.toBeUndefined();
    await expect(limiter.recordFailure(1000)).resolves.toBeUndefined();
  });
});
