/**
 * @jest-environment node
 */
/* eslint-disable no-console */

// Exercises src/services/cache.js against an in-memory stand-in for ioredis, so the rules that
// keep the cache optional (fail open, never throw, skip while disconnected) are covered without
// a server. test/integration/location-cache.test.js covers the real client and the endpoint.

import * as cache from '../../src/services/cache';

jest.mock('ioredis', () => {
  const EventEmitter = require('events'); // eslint-disable-line global-require

  class FakeRedis extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.status = 'ready';
      this.store = new Map();
      this.failWith = null;
      FakeRedis.instances.push(this);
    }

    check() {
      if (this.failWith) {
        throw this.failWith;
      }
    }

    async get(key) {
      this.check();
      return this.store.has(key) ? this.store.get(key) : null;
    }

    async set(key, value, ...args) {
      this.check();
      if (args.includes('NX') && this.store.has(key)) {
        return null;
      }
      this.store.set(key, String(value));
      this.lastSetArgs = args;
      return 'OK';
    }

    async incr(key) {
      this.check();
      const next = Number(this.store.get(key) || 0) + 1;
      this.store.set(key, String(next));
      return next;
    }

    disconnect() {
      this.status = 'end';
    }
  }
  FakeRedis.instances = [];
  return FakeRedis;
});

// eslint-disable-next-line import/order
const FakeRedis = require('ioredis');

const latestClient = () => FakeRedis.instances[FakeRedis.instances.length - 1];

const BYPASS = { key: null, value: null };

describe('location response cache', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await cache.resetForTesting();
    process.env.CACHE_ENABLED = 'true';
    process.env.CACHE_URL = 'rediss://cache.test.invalid:6379';
    delete process.env.CACHE_TTL_SECONDS;
    delete process.env.CACHE_KEY_PREFIX;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('does nothing, and builds no client, without CACHE_ENABLED and CACHE_URL', async () => {
    const before = FakeRedis.instances.length;

    process.env.CACHE_ENABLED = 'false';
    expect(await cache.getCachedLocationResponse('by-slug', 'a')).toEqual(BYPASS);

    process.env.CACHE_ENABLED = 'true';
    delete process.env.CACHE_URL;
    expect(await cache.getCachedLocationResponse('by-slug', 'a')).toEqual(BYPASS);
    await cache.invalidateLocations();

    const transaction = { afterCommit: jest.fn() };
    cache.invalidateLocationsAfterCommit(transaction);
    expect(transaction.afterCommit).not.toHaveBeenCalled();
    expect(FakeRedis.instances.length).toBe(before);
  });

  it('misses, stores with the TTL, then hits', async () => {
    process.env.CACHE_TTL_SECONDS = '120';

    const miss = await cache.getCachedLocationResponse('by-slug', 'some-slug');
    expect(miss.value).toBeNull();
    expect(miss.key).toMatch(/^locations:\d+:by-slug:some-slug$/);

    await cache.setCachedLocationResponse(miss.key, '{"id":1}');
    expect(latestClient().lastSetArgs).toEqual(['EX', 120]);

    expect(await cache.getCachedLocationResponse('by-slug', 'some-slug'))
      .toEqual({ key: miss.key, value: '{"id":1}' });
  });

  it('passes the key prefix and timeouts to the client', async () => {
    process.env.CACHE_KEY_PREFIX = 'stage:';
    await cache.getCachedLocationResponse('by-slug', 'x');
    expect(latestClient().url).toBe('rediss://cache.test.invalid:6379');
    expect(latestClient().options).toEqual(expect.objectContaining({
      keyPrefix: 'stage:',
      connectTimeout: 1000,
      commandTimeout: 250,
      enableOfflineQueue: false,
    }));
  });

  // So that a lost counter can never come back to a generation whose entries are still cached.
  it('seeds a missing generation from the clock', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1767225600000);
    const { key } = await cache.getCachedLocationResponse('by-slug', 'x');
    expect(key).toBe('locations:1767225600000:by-slug:x');
  });

  it('makes every cached response unreachable once invalidated', async () => {
    const first = await cache.getCachedLocationResponse('by-slug', 'x');
    await cache.setCachedLocationResponse(first.key, 'old');

    await cache.invalidateLocations();

    const second = await cache.getCachedLocationResponse('by-slug', 'x');
    expect(second.key).not.toBe(first.key);
    expect(second.value).toBeNull();
  });

  it('skips the cache without waiting while the client is not connected', async () => {
    await cache.getCachedLocationResponse('by-slug', 'x');
    latestClient().status = 'reconnecting';
    const get = jest.spyOn(latestClient(), 'get');

    expect(await cache.getCachedLocationResponse('by-slug', 'x')).toEqual(BYPASS);
    expect(get).not.toHaveBeenCalled();
  });

  it('fails open on command errors and never throws', async () => {
    await cache.getCachedLocationResponse('by-slug', 'x');
    latestClient().failWith = new Error('Command timed out');

    expect(await cache.getCachedLocationResponse('by-slug', 'x')).toEqual(BYPASS);
    await expect(cache.setCachedLocationResponse('locations:1:by-slug:x', 'v'))
      .resolves.toBeUndefined();
    await expect(cache.invalidateLocations()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('invalidation failed'));
  });

  it('gives up on invalidating, with an error, when the client never connects', async () => {
    process.env.CACHE_CONNECT_TIMEOUT_MS = '20';
    await cache.getCachedLocationResponse('by-slug', 'x');
    latestClient().status = 'connecting';
    const incr = jest.spyOn(latestClient(), 'incr');

    await cache.invalidateLocations();
    expect(incr).not.toHaveBeenCalled();
    expect(console.error)
      .toHaveBeenCalledWith(expect.stringContaining('not connected (connecting)'));
  });

  it('waits for a connection in progress before invalidating', async () => {
    await cache.getCachedLocationResponse('by-slug', 'x');
    const client = latestClient();
    client.status = 'connecting';
    const incr = jest.spyOn(client, 'incr');

    const pending = cache.invalidateLocations();
    client.status = 'ready';
    client.emit('ready');
    await pending;
    expect(incr).toHaveBeenCalledTimes(1);
  });

  it('bypasses ids too long to be real slugs', async () => {
    const get = jest.fn();
    await cache.getCachedLocationResponse('by-slug', 'x');
    latestClient().get = get;
    expect(await cache.getCachedLocationResponse('by-slug', 'a'.repeat(257))).toEqual(BYPASS);
    expect(get).not.toHaveBeenCalled();
  });

  it('hooks a transaction once, however many writes share it', () => {
    const transaction = { afterCommit: jest.fn() };
    cache.invalidateLocationsAfterCommit(transaction);
    cache.invalidateLocationsAfterCommit(transaction);
    expect(transaction.afterCommit).toHaveBeenCalledTimes(1);
    expect(transaction.afterCommit).toHaveBeenCalledWith(cache.invalidateLocations);
  });
});
