import crypto from 'crypto';
import https from 'https';
import { EventEmitter } from 'events';
import * as events from '../../src/services/change-feed-events';

const {
  buildEventPayload, createMetadataEventDelivery, postSignedEvent, readEventConfig,
} = events;

const metadataId = '00000000-0000-4000-8000-000000000001';
const edit = {
  id: metadataId,
  resource_table: 'locations',
  resource_id: 'location',
  field_name: 'name',
  previous_value: 'old',
  replacement_value: 'new',
  updated_by: 'editor',
  cursor_at: '2026-11-09T23:01:02.123456Z',
  location_ids: ['location'],
};
const config = {
  url: 'https://receiver.example/events', secret: 'test-key'.repeat(5), stage: 'Stage',
};

const harness = (enabled = true) => {
  const hooks = {};
  const Metadata = { addHook: (type, _name, callback) => { hooks[type] = callback; } };
  const sequelize = {
    query: jest.fn(async (sql) => {
      if (sql.includes('RETURNING d.metadata_id')) {
        return [{ metadata_id: metadataId, attempts: 1 }];
      }
      return [];
    }),
  };
  const readEdits = jest.fn(async () => [edit]);
  const send = jest.fn(async () => {});
  const log = jest.fn();
  const api = createMetadataEventDelivery({
    sequelize,
    Metadata,
    queryTypes: { SELECT: 'SELECT' },
    readConfig: () => enabled && config,
    readEdits,
    send,
    log,
  });
  return {
    hooks, sequelize, readEdits, send, log, api,
  };
};

describe('committed metadata events', () => {
  it('does no queue, lookup or delivery work while disabled', async () => {
    const h = harness(false);
    h.hooks.beforeCreate({}, {});
    await h.hooks.afterCreate({ id: metadataId }, {});
    expect((await h.api.drain()).disabled).toBe(true);
    expect(h.sequelize.query).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('persists delivery in a transaction before registering the commit callback', async () => {
    const h = harness(); const callbacks = [];
    const transaction = { afterCommit: callback => callbacks.push(callback) };
    expect(() => h.hooks.beforeCreate({}, {})).toThrow(/transactional/);
    await h.hooks.afterCreate({ id: metadataId }, { transaction });
    await h.hooks.afterCreate({ id: metadataId }, { transaction });
    expect(callbacks.length).toBe(1);
    expect(h.sequelize.query.mock.calls[0][1].transaction).toBe(transaction);
    expect(h.send).not.toHaveBeenCalled();
    await callbacks[0]();
    expect(h.readEdits).toHaveBeenCalledWith([metadataId]);
    expect(h.send).toHaveBeenCalledWith(config, expect.objectContaining({ stage: 'Stage' }));
    expect(h.send.mock.calls[0][1].edits[0]).toMatchObject({
      previous_value: 'old',
      replacement_value: 'new',
      updated_by: 'editor',
      version: '2026-11-09T23:01:02.123456Z',
    });
  });

  it('waits for the outer commit when a nested savepoint is used', async () => {
    const h = harness(); const callbacks = [];
    const parent = { afterCommit: callback => callbacks.push(callback) };
    const child = { parent, afterCommit: () => { throw new Error('Too early'); } };
    await h.hooks.afterCreate({ id: metadataId }, { transaction: child });
    expect(callbacks.length).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
    await callbacks[0]();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('keeps failed sends retryable without rejecting the already committed edit', async () => {
    const h = harness(); const callbacks = [];
    h.send.mockRejectedValue(new Error('Unavailable'));
    await h.hooks.afterCreate({ id: metadataId }, {
      transaction: { afterCommit: callback => callbacks.push(callback) },
    });
    await expect(callbacks[0]()).resolves.toBeUndefined();
    expect(h.sequelize.query.mock.calls.some(([sql]) => sql.includes('delivered_at = now()')))
      .toBe(false);
    expect(h.sequelize.query.mock.calls.some(([sql]) => sql.includes('make_interval'))).toBe(true);
    h.send.mockResolvedValue(undefined);
    expect((await h.api.drain()).delivered).toBe(1);
    expect(h.send.mock.calls[0][1]).toEqual(h.send.mock.calls[1][1]);
  });

  it('makes oversized values explicit invalidations while retaining ordinary field edits', () => {
    const payload = buildEventPayload([edit, {
      ...edit,
      id: 'large',
      replacement_value: 'x'.repeat(300000),
    }], 'Stage');
    expect(payload.edits[0].replacement_value).toBe('new');
    expect(payload.edits[1]).toMatchObject({ requires_refetch: true, replacement_value: null });
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(256 * 1024);
  });
});

describe('signed notification transport', () => {
  afterEach(() => jest.restoreAllMocks());
  it('signs the exact body, bounds network time and rejects redirects', async () => {
    let callback; let options; let body;
    const request = new EventEmitter();
    request.end = (value) => {
      body = value;
      callback({ statusCode: 302, resume() {} });
      request.emit('close');
    };
    jest.spyOn(https, 'request').mockImplementation((_url, opts, cb) => {
      options = opts; callback = cb; return request;
    });
    await expect(postSignedEvent(config, buildEventPayload([edit], 'Stage')))
      .rejects.toThrow(/302/);
    const timestamp = options.headers['X-Streetlives-Timestamp'];
    const digest = crypto.createHmac('sha256', config.secret)
      .update(`${timestamp}.${body}`).digest('hex');
    expect(options.headers['X-Streetlives-Signature']).toBe(`sha256=${digest}`);
    expect(options.timeout).toBe(3000);
  });
});

describe('event rollout configuration', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it('is disabled by default and fails closed on an invalid enabled configuration', () => {
    delete process.env.CHANGE_FEED_EVENTS_ENABLED;
    expect(readEventConfig()).toBe(null);
    Object.assign(process.env, {
      CHANGE_FEED_EVENTS_ENABLED: 'true',
      CHANGE_FEED_EVENTS_URL: 'http://receiver.example',
      CHANGE_FEED_EVENTS_SECRET: config.secret,
      CHANGE_FEED_EVENTS_STAGE: 'Stage',
    });
    expect(readEventConfig).toThrow(/HTTPS/);
    process.env.CHANGE_FEED_EVENTS_URL = config.url;
    expect(readEventConfig()).toEqual(config);
    process.env.CHANGE_FEED_EVENTS_STAGE = '';
    expect(readEventConfig).toThrow(/Stage\/prod/);
  });
});
