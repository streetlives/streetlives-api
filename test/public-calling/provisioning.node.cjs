// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('provisioning defaults to a bounded dedicated pilot and detects unsafe drift', async () => {
  const { plan, checkSubset } = await import('../../scripts/configure-public-calling.mjs');
  const settings = plan({});
  assert.equal(settings.name, 'yourpeer-public-stage');
  assert.equal(settings.outbound.concurrent_call_limit, 2);
  assert.deepEqual(settings.outbound.whitelisted_destinations, ['US']);
  assert.equal(settings.outbound.daily_spend_limit_enabled, true);
  assert.throws(() => plan({ PUBLIC_CALLING_MAX_CONCURRENT: '2.5' }));
  assert.throws(() => plan({ PUBLIC_CALLING_ENVIRONMENT: 'employee' }));
  checkSubset({ ...settings.outbound, daily_spend_limit: '2.0' }, settings.outbound);
  assert.throws(() => checkSubset({ ...settings.outbound, whitelisted_destinations: ['US', 'CA'] }, settings.outbound));
  assert.throws(() => checkSubset({ ...settings.outbound, daily_spend_limit_enabled: false }, settings.outbound));
});

test('webhook verification binds the exact body and signing key', async () => {
  const { createHash } = require('node:crypto');
  const { AccessToken } = require('livekit-server-sdk');
  const { createProviders } = require('../../src/services/public-calling/providers');
  const key = 'unit-test-livekit-key'; const secret = 'unit-test-secret-'.repeat(4);
  const provider = createProviders({ livekitUrl: 'wss://calls.example.org', livekitKey: key, livekitSecret: secret });
  const body = JSON.stringify({ event: 'room_finished', id: 'event-id', createdAt: String(Math.floor(Date.now() / 1000)), room: { name: 'one-room', sid: 'RM_test' } });
  const token = new AccessToken(key, secret, { ttl: 60 });
  token.sha256 = createHash('sha256').update(body).digest('base64');
  const signature = await token.toJwt();
  assert.equal((await provider.receiveWebhook(body, signature)).id, 'event-id');
  await assert.rejects(provider.receiveWebhook(body.replace('one-room', 'another-room'), signature));
  await assert.rejects(provider.receiveWebhook(body, `${signature.slice(0, -5)}wrong`));
});
