// Valkey response cache for GET /locations-by-slug/:slug (issue streetlives/yourpeer.nyc#741).
//
// Three rules shape everything here:
//
// 1. The cache is an optimisation, never a dependency. Every failure - cache off, not connected
//    yet, timed out, unreachable - falls through to Postgres, and nothing in this module throws.
//    A read waits at most CACHE_COMMAND_TIMEOUT_MS per command, and skips the cache outright
//    while the client isn't connected, so an outage costs no latency.
//
// 2. Entries don't expire (unless CACHE_TTL_SECONDS is set). A cached location stays until a
//    write touches it: src/services/location-cache-invalidation.js works out which locations
//    each committed write affected and calls invalidateLocationSlugs for their slugs. The one
//    time-based exception is a holiday schedule, which drops out of the response the day after
//    its valid_to, so the caller passes that moment as the entry's expiry.
//
// 3. A response read from Postgres before a write commits must never be stored after that
//    write's invalidation - with no TTL it would then be served until the next edit. Each slug
//    has a version counter next to its entry. A reader notes the version before querying
//    Postgres, and stores only if the version is still the same (checked and set in one Lua
//    script, so atomically). Invalidation bumps the version and then deletes the entry, so a
//    racing store either lands before the delete or is refused.
//
// Keys are `locations:{<slug>}:body` and `locations:{<slug>}:version`. The braces are a hash
// tag: ElastiCache Serverless is a cluster, and a script may only touch keys in one slot.
import Redis from 'ioredis';
import config from '../config';

// Anything longer is not a real slug; don't let arbitrary input become cache keys.
const MAX_SLUG_LENGTH = 256;
const KEY_PATTERN = 'locations:*';

const bodyKey = slug => `locations:{${slug}}:body`;
const versionKey = slug => `locations:{${slug}}:version`;

// KEYS[1] body, KEYS[2] version. ARGV[1] the version the caller read, ARGV[2] the body,
// ARGV[3] an absolute expiry in ms or '' for none. Returns 1 if stored.
const STORE_IF_CURRENT = `
local current = redis.call('GET', KEYS[2]) or '0'
if current ~= ARGV[1] then return 0 end
if ARGV[3] ~= '' then
  redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[3])
else
  redis.call('SET', KEYS[1], ARGV[2])
end
return 1
`;

let client = null;

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
    client.defineCommand('storeLocationIfCurrent', { numberOfKeys: 2, lua: STORE_IF_CURRENT });
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

// Resolves to a client that can serve commands, or null. Reads never wait for this - a request
// arriving while the connection is still being set up just skips the cache - but writes to the
// cache that matter (invalidation, warming) do.
const readyClient = async () => {
  const redis = getClient();
  if (!redis) {
    return null;
  }
  return (await waitUntilReady(redis, config.cache.connectTimeoutMs)) ? redis : null;
};

export const connect = async () => Boolean(await readyClient());

// The earlier of "now + CACHE_TTL_SECONDS" (when set) and the caller's own expiry, as ms or ''.
const effectiveExpiry = (expiresAt) => {
  const { ttlSeconds } = config.cache;
  const candidates = [
    ttlSeconds > 0 ? Date.now() + (ttlSeconds * 1000) : null,
    expiresAt ? expiresAt.getTime() : null,
  ].filter(value => value !== null);
  return candidates.length ? Math.min(...candidates) : '';
};

// Looks up the cached response for a slug. Returns { token, value }: `value` is the cached
// string or null; `token` is what to pass to setCachedLocationResponse on a miss, or null when
// the cache can't be used for this request (off, not connected, failing, or a slug too long to
// be real). Must be called before Postgres is queried - see rule 3.
export const getCachedLocationResponse = async (slug) => {
  const redis = getClient();
  if (!redis || redis.status !== 'ready' || String(slug).length > MAX_SLUG_LENGTH) {
    return { token: null, value: null };
  }
  try {
    const [value, version] = await redis.mget(bodyKey(slug), versionKey(slug));
    return { token: { slug, version: version || '0' }, value };
  } catch (err) {
    logError('read failed', err);
    return { token: null, value: null };
  }
};

// Stores a response under a token from getCachedLocationResponse, unless the slug was
// invalidated since. `expiresAt` (a Date, optional) is when the response stops being right on
// its own. Awaited by callers: Lambda freezes the process once the response is sent, and an
// unawaited write could be lost. Resolves to whether it was stored.
export const setCachedLocationResponse = async (token, value, expiresAt = null) => {
  const redis = getClient();
  if (!redis || !token) {
    return false;
  }
  const expiry = effectiveExpiry(expiresAt);
  if (expiry !== '' && expiry <= Date.now()) {
    return false;
  }
  try {
    const stored = await redis.storeLocationIfCurrent(
      bodyKey(token.slug),
      versionKey(token.slug),
      token.version,
      value,
      String(expiry),
    );
    return stored === 1;
  } catch (err) {
    logError('write failed', err);
    return false;
  }
};

// Drops the cached responses for these slugs. Waits for the connection (unlike reads): with no
// TTL, a skipped invalidation would leave the old response cached until the next edit.
// Never throws, because it runs in a transaction's afterCommit hook - see
// location-cache-invalidation.js.
export const invalidateLocationSlugs = async (slugs) => {
  const unique = [...new Set(slugs)].filter(slug => slug && slug.length <= MAX_SLUG_LENGTH);
  if (!unique.length || !config.cache.enabled) {
    return;
  }
  try {
    const redis = await readyClient();
    if (!redis) {
      throw new Error(`not connected (${client ? client.status : 'no client'})`);
    }
    // One command per key, in order: version first, then the entry (rule 3). Separate commands
    // rather than a multi-key DEL, which a cluster refuses when the keys are in different slots.
    const pipeline = redis.pipeline();
    unique.forEach((slug) => {
      pipeline.incr(versionKey(slug));
      pipeline.del(bodyKey(slug));
    });
    const results = await pipeline.exec();
    const failed = results.find(([err]) => err);
    if (failed) {
      throw failed[0];
    }
  } catch (err) {
    logError(`invalidation of ${unique.join(', ')} failed; they stay cached until edited again `
      + 'or the cache is flushed', err);
  }
};

// Removes every cached location response (and version counter). For when something changed that
// no per-location invalidation can see: a deploy that changes the response, a migration that
// edits reference data, a write to a table location-cache-invalidation.js doesn't map. Resolves
// to the number of keys removed; throws if the cache is unreachable, because a caller that asked
// for a flush needs to know it didn't happen.
export const flushLocations = async () => {
  const redis = await readyClient();
  if (!redis) {
    throw new Error('cache: not connected');
  }
  // SCAN's MATCH and the keys it returns carry the prefix, which ioredis would add again on DEL.
  const prefix = config.cache.keyPrefix;
  let removed = 0;
  let cursor = '0';
  do {
    // eslint-disable-next-line no-await-in-loop
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}${KEY_PATTERN}`, 'COUNT', 500);
    cursor = next;
    if (keys.length) {
      const pipeline = redis.pipeline();
      keys.forEach(key => pipeline.unlink(key.slice(prefix.length)));
      // eslint-disable-next-line no-await-in-loop
      await pipeline.exec();
      removed += keys.length;
    }
  } while (cursor !== '0');
  return removed;
};

// Test-only: drops the client so the next call builds one from the current environment.
export const resetForTesting = async () => {
  if (client) {
    const old = client;
    client = null;
    // A connection attempt in flight can still report its failure after disconnect().
    old.removeAllListeners('error');
    old.on('error', () => {});
    old.disconnect();
  }
};
