import crypto from 'crypto';
import https from 'https';

const BATCH_SIZE = 20;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const TX_IDS = new WeakMap();
let installedDelivery = null;

export const readEventConfig = () => {
  if (process.env.CHANGE_FEED_EVENTS_ENABLED !== 'true') return null;
  const url = new URL(process.env.CHANGE_FEED_EVENTS_URL || '');
  const secret = process.env.CHANGE_FEED_EVENTS_SECRET || '';
  const stage = process.env.CHANGE_FEED_EVENTS_STAGE;
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || secret.length < 32 || !['Stage', 'prod'].includes(stage)) {
    throw new Error('Change events require HTTPS, a 32-character secret and explicit Stage/prod.');
  }
  // Explicitly separate consumers and secrets per deployment; never derive from NODE_ENV.
  return { url: url.href, secret, stage };
};

export const buildEventPayload = (edits, stage) => {
  const payload = {
    type: 'streetlives.metadata.changed',
    version: 1,
    stage,
    edits: edits.map(({ cursor_at: version, ...edit }) => ({
      ...edit,
      // Preserve microseconds for the receiver's per-field ordering guard.
      version: version || edit.created_at,
    })),
  };
  // Large values become explicit invalidations; never truncate a field value.
  // Grouping the remaining edits keeps one bounded HTTP call per transaction.
  while (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    const candidates = payload.edits.filter(edit => !edit.requires_refetch);
    const largest = candidates.sort((a, b) =>
      JSON.stringify(b).length - JSON.stringify(a).length)[0];
    if (!largest) throw new Error('Change event identities exceed the delivery limit.');
    largest.previous_value = null;
    largest.replacement_value = null;
    largest.requires_refetch = true;
  }
  return payload;
};

export const postSignedEvent = (config, payload) => new Promise((resolve, reject) => {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > MAX_PAYLOAD_BYTES) {
    reject(new Error('Change event exceeds the delivery payload limit.'));
    return;
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', config.secret)
    .update(`${timestamp}.${body}`).digest('hex');
  const request = https.request(config.url, {
    method: 'POST',
    timeout: 3000,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Streetlives-Timestamp': timestamp,
      'X-Streetlives-Signature': `sha256=${signature}`,
    },
  }, (response) => {
    response.resume();
    // Only acknowledge once the receiver explicitly accepted durable ownership.
    if ([200, 202, 204].includes(response.statusCode)) resolve();
    else reject(new Error(`Change event HTTP ${response.statusCode}`));
  });
  // Socket inactivity alone does not bound DNS/TLS setup time.
  const deadline = setTimeout(() => request.destroy(new Error('Change event deadline')), 3000);
  request.on('close', () => clearTimeout(deadline));
  request.on('timeout', () => request.destroy(new Error('Change event timeout')));
  request.on('error', reject);
  request.end(body);
});

export const createMetadataEventDelivery = ({
  sequelize, Metadata, queryTypes, readEdits, send = postSignedEvent,
  readConfig = readEventConfig,
  log = data => process.stderr.write(`${JSON.stringify(data)}\n`),
}) => {
  const query = (sql, options = {}) => sequelize.query(sql, {
    type: queryTypes.SELECT, ...options,
  });
  const drain = async (ids = null) => {
    const config = readConfig();
    if (!config) return { disabled: true, delivered: 0, failed: 0 };
    // Short DB lease; never hold a connection/transaction during the HTTP call.
    const rows = await query(`
      UPDATE metadata_event_deliveries d
      SET next_attempt_at = now() + interval '1 minute', attempts = d.attempts + 1
      WHERE d.metadata_id IN (
        SELECT metadata_id FROM metadata_event_deliveries
        WHERE delivered_at IS NULL AND next_attempt_at <= now()
          ${ids ? 'AND metadata_id = ANY($1::uuid[])' : ''}
        ORDER BY next_attempt_at, metadata_id LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      ) RETURNING d.metadata_id, d.attempts
    `, { bind: ids ? [ids] : [] });
    const result = { delivered: 0, failed: 0 };
    if (!rows.length) return result;
    const claimedIds = rows.map(row => row.metadata_id);
    try {
      const edits = await readEdits(claimedIds);
      if (edits.length !== claimedIds.length) throw new Error('Missing claimed metadata rows.');
      await send(config, buildEventPayload(edits, config.stage));
      await query(`UPDATE metadata_event_deliveries SET delivered_at = now()
        WHERE metadata_id = ANY($1::uuid[])`, { bind: [claimedIds] });
      result.delivered = rows.length;
    } catch (error) {
      result.failed = rows.length;
      log({
        event: 'change_feed_delivery_failed',
        count: claimedIds.length,
        stage: config.stage,
        error: error.name,
      });
      const attempts = Math.max(...rows.map(row => row.attempts));
      await query(`UPDATE metadata_event_deliveries
        SET next_attempt_at = now() + make_interval(secs => $2::int)
        WHERE metadata_id = ANY($1::uuid[]) AND delivered_at IS NULL`, {
        bind: [claimedIds, Math.min(3600, 30 * (2 ** Math.min(attempts, 7)))],
      });
    }
    log({ event: 'change_feed_delivery_batch', stage: config.stage, ...result });
    return result;
  };
  const requireTransaction = (_instance, options) => {
    if (readConfig() && !options.transaction) {
      throw new Error('Immediate change events require transactional metadata writes.');
    }
  };
  const enqueue = async (instances, options) => {
    if (!readConfig()) return;
    const ids = instances.map(instance => instance.id);
    if (!ids.length) return;
    await query(`INSERT INTO metadata_event_deliveries (metadata_id)
      SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING`, {
      bind: [ids], transaction: options.transaction,
    });
    let commitOwner = options.transaction;
    while (commitOwner.parent) commitOwner = commitOwner.parent;
    let pending = TX_IDS.get(commitOwner);
    if (!pending) {
      pending = new Set();
      TX_IDS.set(commitOwner, pending);
      commitOwner.afterCommit(async () => {
        // Do not turn a committed successful edit into a failed save. The
        // scheduler/replay feed owns recovery if this immediate attempt fails.
        try { await drain([...pending]); } catch (error) {
          log({ event: 'change_feed_after_commit_failed', count: pending.size });
        }
      });
    }
    ids.forEach(id => pending.add(id));
  };
  Metadata.addHook('beforeCreate', 'changeFeedEventsTransaction', requireTransaction);
  Metadata.addHook('beforeBulkCreate', 'changeFeedEventsTransaction', requireTransaction);
  Metadata.addHook('afterCreate', 'changeFeedEvents', (instance, options) =>
    enqueue([instance], options));
  Metadata.addHook('afterBulkCreate', 'changeFeedEvents', enqueue);
  return { drain };
};

export const installMetadataEventDelivery = (dependencies) => {
  installedDelivery = createMetadataEventDelivery(dependencies);
};

export const drainMetadataEvents = () => installedDelivery.drain();
