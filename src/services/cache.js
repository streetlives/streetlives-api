// Valkey response cache for public location reads (issue streetlives/yourpeer.nyc#741).
//
// Two rules shape everything here:
//
// 1. The cache is an optimisation, never a dependency. Every failure - cache off, not connected
//    yet, timed out, unreachable - falls through to Postgres, and nothing in this module throws.
//    A read waits at most CACHE_COMMAND_TIMEOUT_MS per command, and skips the cache outright
//    while the client isn't connected, so an outage costs no latency.
//
// 2. Invalidation is by generation, not by key. Every cached entry's key carries the current
//    value of one counter, and every committed write through src/services/data-changes.js bumps
//    it. That makes all cached responses unreachable at once, without having to work out which
//    locations a write to a phone, a schedule or a taxonomy attribute affects. Writes come only
//    from the street team, so throwing everything away on each one is cheap. Superseded entries
//    expire on their own after CACHE_TTL_SECONDS, which is also how long anything that changes
//    the database *without* going through data-changes.js (a manual psql fix, a data migration)
//    can stay stale.
//
// Ordering: callers read the generation *before* querying Postgres, and the bump runs *after*
// the write commits. So an entry is stored under a generation that was current when its data was
// read, and any write that committed after that read has bumped the generation past it.
import Redis from 'ioredis';
import config from '../config';

const GENERATION_KEY = 'locations:generation';
// Anything longer is not a real slug or id; don't let arbitrary input become cache keys.
const MAX_ID_LENGTH = 256;

let client = null;
const hookedTransactions = new WeakSet();

const logError = (message, err) => {
  // eslint-disable-next-line no-console
  console.error(`cache: ${message}${err ? `: ${err.message}` : ''}`);
};

const getClient = () => {
  if (!config.cache.enabled) {
    return null;
  }
  if (!client) {
    // Created on first use and kept at module scope, so warm Lambda invocations reuse the
    // connection. A rediss:// URL turns on TLS, which ElastiCache Serverless requires.
    client = new Redis(config.cache.url, {
      keyPrefix: config.cache.keyPrefix,
      connectTimeout: config.cache.connectTimeoutMs,
      commandTimeout: config.cache.commandTimeoutMs,
      maxRetriesPerRequest: 1,
      // Fail a command at once while disconnected instead of queueing it until reconnection.
      enableOfflineQueue: false,
      retryStrategy: times => Math.min(times * 200, 5000),
    });
    // Without a listener ioredis reports every failed reconnect as an unhandled error event.
    client.on('error', err => logError('connection error', err));
  }
  return client;
};

const waitUntilReady = (redis, timeoutMs) => {
  if (redis.status === 'ready') {
    return Promise.resolve(true);
  }
  if (redis.status === 'end') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const onReady = () => {
      // eslint-disable-next-line no-use-before-define
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      redis.removeListener('ready', onReady);
      resolve(false);
    }, timeoutMs);
    redis.once('ready', onReady);
  });
};

// Connects (if caching is on) and resolves once the client can serve commands. Reads never wait
// for this - a request arriving while the connection is still being set up just skips the cache -
// but tests and the invalidation path do.
export const connect = async () => {
  const redis = getClient();
  return Boolean(redis) && waitUntilReady(redis, config.cache.connectTimeoutMs);
};

const getGeneration = async (redis) => {
  const current = await redis.get(GENERATION_KEY);
  if (current !== null) {
    return current;
  }
  // Missing on a new cache, or lost to eviction or a flush. Seed it from the clock rather than
  // 0: a counter that restarted from a small number could land back on a generation whose
  // entries are still cached, and serve them. Writes since the last seed number far fewer than
  // the milliseconds elapsed, so the clock is always ahead of any value used before.
  await redis.set(GENERATION_KEY, Date.now(), 'NX');
  return redis.get(GENERATION_KEY);
};

// Looks up a cached response. `kind` names the endpoint and `id` the resource within it.
// Returns { key, value }: `value` is the cached string or null; `key` is where to store the
// response on a miss, or null when the cache can't be used for this request (off, not
// connected, failing, or an id too long to be real).
export const getCachedLocationResponse = async (kind, id) => {
  const redis = getClient();
  if (!redis || redis.status !== 'ready' || String(id).length > MAX_ID_LENGTH) {
    return { key: null, value: null };
  }
  try {
    const generation = await getGeneration(redis);
    const key = `locations:${generation}:${kind}:${id}`;
    return { key, value: await redis.get(key) };
  } catch (err) {
    logError(`read of ${kind} failed`, err);
    return { key: null, value: null };
  }
};

// Stores a response under a key from getCachedLocationResponse. Awaited by callers, because
// Lambda freezes the process once the response is sent and an unawaited write could be lost.
export const setCachedLocationResponse = async (key, value) => {
  const redis = getClient();
  if (!redis || !key) {
    return;
  }
  try {
    await redis.set(key, value, 'EX', config.cache.ttlSeconds);
  } catch (err) {
    logError('write failed', err);
  }
};

// Makes every cached location response unreachable. Waits for the connection (unlike reads):
// skipping this would leave stale data cached for up to CACHE_TTL_SECONDS.
export const invalidateLocations = async () => {
  const redis = getClient();
  if (!redis) {
    return;
  }
  try {
    if (!(await waitUntilReady(redis, config.cache.connectTimeoutMs))) {
      throw new Error(`not connected (${redis.status})`);
    }
    await redis.incr(GENERATION_KEY);
  } catch (err) {
    logError(
      'invalidation failed; cached locations may be stale for up to CACHE_TTL_SECONDS',
      err,
    );
  }
};

// Schedules invalidateLocations for when `transaction` commits. Sequelize awaits afterCommit
// hooks inside commit(), so the bump lands before the write's response is sent - and a throwing
// hook would turn a committed write into a 500, which is why invalidateLocations never throws.
// Registered once per transaction however many helpers share it.
export const invalidateLocationsAfterCommit = (transaction) => {
  if (!config.cache.enabled || hookedTransactions.has(transaction)) {
    return;
  }
  hookedTransactions.add(transaction);
  transaction.afterCommit(invalidateLocations);
};

// Test-only: drops the client so the next call builds one from the current environment.
export const resetForTesting = async () => {
  if (client) {
    const old = client;
    client = null;
    old.disconnect();
  }
};
