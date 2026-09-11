// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
// Runs only against an explicitly opted-in, local test DB. Never loads test/setup.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createStore } = require('../../src/services/public-calling/store');
test('Postgres serializes independent connection pools and rolls back failed reservations', { skip: process.env.PUBLIC_CALLING_TEST_POSTGRES !== 'true' }, async () => {
  assert.ok(['localhost', '127.0.0.1'].includes(process.env.DATABASE_HOST));
  assert.equal(process.env.DATABASE_NAME, 'test');
  const schema = `calling_test_${process.pid}_${Date.now()}`;
  const options = { host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 5432), dialect: 'postgres', logging: false, pool: { max: 5 }, dialectOptions: { options: `-c search_path=${schema}` } };
  const one = new Sequelize('test', process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, options);
  const two = new Sequelize('test', process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, options);
  try {
    await one.query(`CREATE SCHEMA "${schema}"`);
    await one.query(`CREATE TABLE "${schema}".public_calling_state (key text PRIMARY KEY, state jsonb NOT NULL)`);
    const stores = [createStore(one), createStore(two)];
    await Promise.all(Array.from({ length: 30 }, (_, index) => stores[index % 2].transaction(state => { state.counter = (state.counter || 0) + 1; })));
    assert.equal(await stores[0].transaction(state => state.counter), 30);
    await assert.rejects(stores[0].transaction(state => { state.counter = 999; throw new Error('abort'); }));
    assert.equal(await stores[1].transaction(state => state.counter), 30);
  } finally { await one.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await one.close(); await two.close(); }
});
