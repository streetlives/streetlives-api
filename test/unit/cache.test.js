/**
 * @jest-environment node
 */
/* eslint-disable no-console */

// Exercises src/services/cache.js against an in-memory stand-in for ioredis, so the rules that
// keep the cache optional (fail open, never throw, skip while disconnected) and the version check
// that keeps a stale read from being stored are covered without a server.
// test/integration/location-cache.test.js covers the real client, the Lua script and the endpoint.

import * as cache from '../../src/services/cache';
import { startOfDateInTimeZone } from '../../src/utils/times';

jest.mock('ioredis', () => {
  const EventEmitter = require('events'); // eslint-disable-line global-require

  class FakeRedis extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.status = 'ready';
      this.store = new Map();
      this.expiries = new Map();
      this.failWith = null;
      FakeRedis.instances.push(this);
    }

    check() {
      if (this.failWith) {
        throw this.failWith;
      }
    }

    defineCommand(name) {
      this.definedCommands = [...(this.definedCommands || []), name];
    }

    async mget(...keys) {
      this.check();
      return keys.map(key => (this.store.has(key) ? this.store.get(key) : null));
    }

    // What the Lua script in cache.js does.
    async storeLocationIfCurrent(body, version, readVersion, value, expiry) {
      this.check();
      if ((this.store.get(version) || '0') !== readVersion) {
        return 0;
      }
      this.store.set(body, value);
      this.expiries.set(body, expiry);
      return 1;
    }

    pipeline() {
      const commands = [];
      const pipeline = {
        incr: (key) => { commands.push(() => this.incrSync(key)); return pipeline; },
        del: (key) => { commands.push(() => this.store.delete(key)); return pipeline; },
        exec: async () => {
          this.check();
          return commands.map(command => [null, command()]);
        },
      };
      return pipeline;
    }

    incrSync(key) {
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

const BYPASS = { token: null, value: null };

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
    expect(await cache.getCachedLocationResponse('a')).toEqual(BYPASS);

    process.env.CACHE_ENABLED = 'true';
    delete process.env.CACHE_URL;
    expect(await cache.getCachedLocationResponse('a')).toEqual(BYPASS);
    await cache.invalidateLocationSlugs(['a']);
    expect(FakeRedis.instances.length).toBe(before);
  });

  it('misses, stores with no expiry by default, then hits', async () => {
    const miss = await cache.getCachedLocationResponse('some-slug');
    expect(miss).toEqual({ token: { slug: 'some-slug', version: '0' }, value: null });

    expect(await cache.setCachedLocationResponse(miss.token, '{"id":1}')).toBe(true);
    expect(latestClient().expiries.get('locations:{some-slug}:body')).toBe('');

    expect((await cache.getCachedLocationResponse('some-slug')).value).toBe('{"id":1}');
  });

  it('expires at the earlier of CACHE_TTL_SECONDS and the response\'s own expiry', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
    const { token } = await cache.getCachedLocationResponse('x');

    process.env.CACHE_TTL_SECONDS = '120';
    await cache.setCachedLocationResponse(token, 'v');
    expect(latestClient().expiries.get('locations:{x}:body')).toBe(String(1000000 + 120000));

    await cache.setCachedLocationResponse(token, 'v', new Date(1000000 + 5000));
    expect(latestClient().expiries.get('locations:{x}:body')).toBe(String(1000000 + 5000));
  });

  it('does not store a response whose expiry has already passed', async () => {
    const { token } = await cache.getCachedLocationResponse('x');
    expect(await cache.setCachedLocationResponse(token, 'v', new Date(Date.now() - 1))).toBe(false);
    expect(latestClient().store.has('locations:{x}:body')).toBe(false);
  });

  it('passes the key prefix and timeouts to the client', async () => {
    process.env.CACHE_KEY_PREFIX = 'stage:';
    await cache.getCachedLocationResponse('x');
    expect(latestClient().url).toBe('rediss://cache.test.invalid:6379');
    expect(latestClient().definedCommands).toEqual(['storeLocationIfCurrent']);
    expect(latestClient().options).toEqual(expect.objectContaining({
      keyPrefix: 'stage:',
      connectTimeout: 1000,
      commandTimeout: 250,
      enableOfflineQueue: false,
    }));
  });

  it('drops only the invalidated slugs', async () => {
    const a = await cache.getCachedLocationResponse('a');
    const b = await cache.getCachedLocationResponse('b');
    await cache.setCachedLocationResponse(a.token, 'A');
    await cache.setCachedLocationResponse(b.token, 'B');

    await cache.invalidateLocationSlugs(['a']);

    expect((await cache.getCachedLocationResponse('a')).value).toBeNull();
    expect((await cache.getCachedLocationResponse('b')).value).toBe('B');
  });

  // The read-before-write race: Postgres was read, then a write committed and invalidated,
  // and only then does the reader try to store what it read.
  it('refuses to store a response read before an invalidation', async () => {
    const { token } = await cache.getCachedLocationResponse('a');
    await cache.invalidateLocationSlugs(['a']);
    expect(await cache.setCachedLocationResponse(token, 'stale')).toBe(false);
    expect((await cache.getCachedLocationResponse('a')).value).toBeNull();
  });

  it('skips the cache without waiting while the client is not connected', async () => {
    await cache.getCachedLocationResponse('x');
    latestClient().status = 'reconnecting';
    const mget = jest.spyOn(latestClient(), 'mget');

    expect(await cache.getCachedLocationResponse('x')).toEqual(BYPASS);
    expect(mget).not.toHaveBeenCalled();
  });

  it('fails open on command errors and never throws', async () => {
    const { token } = await cache.getCachedLocationResponse('x');
    latestClient().failWith = new Error('Command timed out');

    expect(await cache.getCachedLocationResponse('x')).toEqual(BYPASS);
    expect(await cache.setCachedLocationResponse(token, 'v')).toBe(false);
    await expect(cache.invalidateLocationSlugs(['x'])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('invalidation of x failed'));
  });

  it('gives up on invalidating, with an error, when the client never connects', async () => {
    process.env.CACHE_CONNECT_TIMEOUT_MS = '20';
    await cache.getCachedLocationResponse('x');
    latestClient().status = 'connecting';
    const pipeline = jest.spyOn(latestClient(), 'pipeline');

    await cache.invalidateLocationSlugs(['x']);
    expect(pipeline).not.toHaveBeenCalled();
    expect(console.error)
      .toHaveBeenCalledWith(expect.stringContaining('not connected (connecting)'));
  });

  it('waits for a connection in progress before invalidating', async () => {
    await cache.getCachedLocationResponse('x');
    const client = latestClient();
    client.status = 'connecting';
    const pipeline = jest.spyOn(client, 'pipeline');

    const pending = cache.invalidateLocationSlugs(['x']);
    client.status = 'ready';
    client.emit('ready');
    await pending;
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('bypasses slugs too long to be real', async () => {
    await cache.getCachedLocationResponse('x');
    const mget = jest.spyOn(latestClient(), 'mget');
    expect(await cache.getCachedLocationResponse('a'.repeat(257))).toEqual(BYPASS);
    expect(mget).not.toHaveBeenCalled();
  });
});

describe('startOfDateInTimeZone', () => {
  it('finds New York midnight in both daylight and standard time', () => {
    expect(startOfDateInTimeZone('2026-07-05', 'America/New_York').toISOString())
      .toBe('2026-07-05T04:00:00.000Z');
    expect(startOfDateInTimeZone('2026-12-25', 'America/New_York').toISOString())
      .toBe('2026-12-25T05:00:00.000Z');
  });
});
