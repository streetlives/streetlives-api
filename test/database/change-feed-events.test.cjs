// Runs on a disposable LOCAL PostgreSQL DB, without PostGIS or production data.
require('@babel/register')({ extensions: ['.js'], cache: false });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Sequelize = require('sequelize');
const { createMetadataEventDelivery } = require('../../src/services/change-feed-events');
const migration = require('../../sequelize/migrations/20261109120000-metadata-event-deliveries').default;

if (process.env.CHANGE_FEED_TEST_DATABASE_NAME !== 'change_feed_events_test') {
  throw new Error('Set CHANGE_FEED_TEST_DATABASE_NAME=change_feed_events_test for this disposable DB test.');
}
const sequelize = new Sequelize('change_feed_events_test', 'streetlives', '', {
  host: '127.0.0.1', port: Number(process.env.CHANGE_FEED_TEST_DATABASE_PORT || 55439),
  dialect: 'postgres', logging: false, pool: { min: 0, max: 1 },
});
const Metadata = sequelize.define('Metadata', {
  id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
  resource_id: Sequelize.UUID, resource_table: Sequelize.TEXT,
  field_name: Sequelize.TEXT, last_action_type: Sequelize.TEXT,
  previous_value: Sequelize.TEXT, replacement_value: Sequelize.TEXT,
  updated_by: Sequelize.TEXT,
  last_action_date: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
  source: Sequelize.TEXT,
}, { tableName: 'metadata', underscored: true });
let enabled = true; let offline = false; let pauseSend = null;
const sent = [];
const readEdits = ids => sequelize.query('SELECT *, created_at::text AS cursor_at FROM metadata WHERE id = ANY($1::uuid[])',
  { bind: [ids], type: Sequelize.QueryTypes.SELECT });
const dependencies = { sequelize, Metadata, queryTypes: Sequelize.QueryTypes, readEdits,
  readConfig: () => enabled && { stage: 'Stage' }, log() {},
  send: async (_config, body) => {
    if (offline) throw new Error('Receiver offline');
    if (pauseSend) await pauseSend;
    sent.push(body);
  } };
const delivery = createMetadataEventDelivery(dependencies);
const createEdit = transaction => Metadata.create({ resource_id: randomUUID(),
  resource_table: 'locations', field_name: 'name', last_action_type: 'update',
  previous_value: 'old', replacement_value: 'new', updated_by: 'test editor' }, { transaction });
const rows = () => sequelize.query('SELECT * FROM metadata_event_deliveries',
  { type: Sequelize.QueryTypes.SELECT });

before(async () => {
  await sequelize.query('DROP TABLE IF EXISTS metadata_event_deliveries');
  await Metadata.sync({ force: true });
  await migration.up(sequelize.getQueryInterface());
  const tables = ['locations', 'organizations', 'services', 'service_at_locations',
    'physical_addresses', 'accessibility_for_disabilities', 'streetviews', 'location_photos',
    'phones', 'event_related_info', 'regular_schedules', 'holiday_schedules', 'service_areas',
    'eligibility', 'service_taxonomy_specific_attributes', 'service_taxonomy', 'service_languages',
    'required_documents', 'documents_infos', 'comments', 'error_reports'];
  for (const table of tables) {
    await sequelize.query(`DROP TABLE IF EXISTS ${table}; CREATE TABLE ${table} (
      id uuid PRIMARY KEY, location_id uuid, service_id uuid,
      service_at_location_id uuid, organization_id uuid, valid_to date
    )`);
  }
});
after(async () => { await sequelize.close(); });

test('rollback removes both the metadata row and delivery work and never sends', async () => {
  const beforeCount = sent.length;
  await assert.rejects(sequelize.transaction(async (transaction) => {
    const edit = await createEdit(transaction);
    const queued = await sequelize.query('SELECT metadata_id FROM metadata_event_deliveries WHERE metadata_id=$1',
      { bind: [edit.id], transaction, type: Sequelize.QueryTypes.SELECT });
    assert.equal(queued.length, 1);
    assert.equal(sent.length, beforeCount);
    throw new Error('Rollback test');
  }), /Rollback test/);
  assert.equal(sent.length, beforeCount);
  assert.equal((await rows()).length, 0);
});

test('committed fields send once in a batch after commit with actual stored attribution', async () => {
  const start = sent.length;
  await sequelize.transaction(async (transaction) => {
    await Promise.all([createEdit(transaction), createEdit(transaction)]);
    assert.equal(sent.length, start);
  });
  assert.equal(sent.length, start + 1);
  assert.equal(sent.at(-1).edits.length, 2);
  assert.equal(sent.at(-1).edits[0].updated_by, 'test editor');
  assert.ok((await rows()).every(row => row.delivered_at));
  assert.equal((await delivery.drain()).delivered, 0);
});

test('failed delivery survives commit and is recovered by a restarted worker', async () => {
  offline = true;
  const edit = await sequelize.transaction(createEdit);
  let queued = (await rows()).find(row => row.metadata_id === edit.id);
  assert.equal(queued.attempts, 1);
  assert.equal(queued.delivered_at, null);
  assert.equal((await delivery.drain()).delivered, 0, 'backoff is honored');
  await sequelize.query('UPDATE metadata_event_deliveries SET next_attempt_at=now() WHERE metadata_id=$1',
    { bind: [edit.id] });
  offline = false;
  // Worker restart: drain depends only on persisted delivery rows, not TX_IDS.
  const RestartMetadata = { addHook() {} };
  const restarted = createMetadataEventDelivery({ ...dependencies, Metadata: RestartMetadata });
  assert.equal((await restarted.drain()).delivered, 1);
  queued = (await rows()).find(row => row.metadata_id === edit.id);
  assert.equal(queued.attempts, 2);
  assert.ok(queued.delivered_at);
});

test('a real savepoint waits for the outer commit and bulk work stays bounded', async () => {
  const beforeCount = sent.length;
  await sequelize.transaction(async (transaction) => {
    await sequelize.transaction({ transaction }, async child => createEdit(child));
    assert.equal(sent.length, beforeCount, 'savepoint release is not a committed edit');
    const values = Array.from({ length: 22 }, () => ({ id: randomUUID(),
      resource_id: randomUUID(), resource_table: 'locations', field_name: 'name',
      last_action_type: 'update', replacement_value: 'bulk' }));
    await Metadata.bulkCreate(values, { transaction });
  });
  assert.equal(sent.length, beforeCount + 1, 'the save path makes only one HTTP request');
  assert.equal(sent.at(-1).edits.length, 20);
  assert.equal((await delivery.drain()).delivered, 3, 'remaining fields are durable retry work');
});

test('concurrent retry workers cannot both claim the same delivery', async () => {
  enabled = true; offline = true;
  const edit = await sequelize.transaction(createEdit);
  await sequelize.query('UPDATE metadata_event_deliveries SET next_attempt_at=now() WHERE metadata_id=$1',
    { bind: [edit.id] });
  offline = false;
  let release;
  pauseSend = new Promise(resolve => { release = resolve; });
  const first = delivery.drain();
  // Wait for the lease to be committed before allowing another worker to claim.
  for (;;) {
    if ((await rows()).find(row => row.metadata_id === edit.id).attempts === 2) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal((await delivery.drain()).delivered, 0);
  release(); await first; pauseSend = null;
});

test('disabled gate allows edits but creates no new delivery rows', async () => {
  enabled = false;
  const count = (await rows()).length;
  await createEdit();
  assert.equal((await rows()).length, count);
  assert.equal((await delivery.drain()).disabled, true);
});

test('exact-ID events share real replay attribution and bypass only the settling window', async () => {
  // Inject this isolated test connection into the production SQL resolver.
  const modelsPath = require.resolve('../../src/models');
  require.cache[modelsPath] = { id: modelsPath, filename: modelsPath, loaded: true,
    exports: { sequelize, Sequelize } };
  const { getLocationEventEdits, getLocationEdits, getLocationChanges } = require('../../src/services/location-changes');
  const orgId = randomUUID(), loc1 = randomUUID(), loc2 = randomUUID();
  await sequelize.query('INSERT INTO organizations (id) VALUES ($1)', { bind: [orgId] });
  await sequelize.query('INSERT INTO locations (id, organization_id) VALUES ($1,$3),($2,$3)',
    { bind: [loc1, loc2, orgId] });
  const orgEdit = await Metadata.create({ resource_id: orgId, resource_table: 'organizations',
    field_name: 'name', last_action_type: 'update', previous_value: 'org', replacement_value: 'new org' });
  const [resolved] = await getLocationEventEdits([orgEdit.id]);
  assert.deepEqual(resolved.location_ids.sort(), [loc1, loc2].sort());
  assert.equal(resolved.replacement_value, 'new org');
  process.env.CHANGE_FEED_SETTLE_SECONDS = '120';
  const since = new Date(Date.now() - 60000).toISOString();
  assert.equal((await getLocationEdits({ since })).edits.some(row => row.id === orgEdit.id), false);
  process.env.CHANGE_FEED_SETTLE_SECONDS = '0';
  assert.equal((await getLocationEdits({ since })).edits.some(row => row.id === orgEdit.id), true);
  // Location deletion resolves to its own ID after the row has gone away.
  await sequelize.query('DELETE FROM locations WHERE id=$1', { bind: [loc1] });
  const deleted = await Metadata.create({ resource_id: loc1, resource_table: 'locations',
    last_action_type: 'delete', field_name: 'organization_id', previous_value: orgId });
  assert.deepEqual((await getLocationEventEdits([deleted.id]))[0].location_ids, [loc1]);
  const change = (await getLocationChanges({ since })).changes.find(row => row.location_id === loc1);
  assert.equal(change.deleted, true);
});
