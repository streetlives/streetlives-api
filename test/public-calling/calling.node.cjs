// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../../src/services/public-calling/service');
const { emptyState } = require('../../src/services/public-calling/store');
const { readConfig } = require('../../src/services/public-calling/config');
const { parseNumber, parseHref, linkedNumbers } = require('../../src/services/public-calling/phone');
const { createDirectory } = require('../../src/services/public-calling/directory');
const { createProviders } = require('../../src/services/public-calling/providers');
const { sameSecret, createRouter } = require('../../src/controllers/public-calling');
const express = require('express');
const supertest = require('supertest');

function fixture(overrides = {}) {
  let state = emptyState();
  let chain = Promise.resolve();
  let clock = Date.parse('2026-09-11T12:00:00Z');
  const config = { ...readConfig({}), enabled: true, secret: 'test-secret-'.repeat(4), hashSecret: 'test-hash-'.repeat(4), callerNumber: '+12125550999', livekitUrl: 'wss://calls.example.org', dailyMinutes: 10000, ...overrides };
  const store = { transaction(work) { const next = chain.then(async () => { const copy = JSON.parse(JSON.stringify(state)); const result = await work(copy); state = copy; return result; }); chain = next.catch(() => {}); return next; } };
  const history = { dial: [], close: [] };
  const provider = {
    createRoom: async call => ({ sid: `RM_${call.id}` }), token: async () => 'room-only-token',
    participant: async call => ({ identity: call.browserIdentity, tracks: [{ type: 0, source: 2, muted: false }] }),
    participants: async call => [{ identity: call.browserIdentity }, { identity: call.sipIdentity, attributes: { 'sip.callStatus': 'active' } }],
    closeRoom: async call => { history.close.push(call.id); },
    dial: async call => { history.dial.push(call); },
    requestVerification: async () => ({ mode: 'visitor', providerId: 'verification' }),
    confirmVerification: async (challenge, code) => code === '123456',
    receiveWebhook: async body => JSON.parse(body),
  };
  const directory = async input => { const phone = parseHref(input.href); if (!phone) throw new Error('invalid destination'); return { ...phone, locationId: input.locationId, serviceId: input.serviceId || null, href: input.href }; };
  const service = createService({ config, store, provider, directory, now: () => clock });
  return { config, store, provider, service, history, state: () => state, advance: ms => { clock += ms; }, now: () => clock };
}
const context = name => ({ session: name.repeat(64).slice(0, 64), ip: '192.0.2.1' });
const input = (requestId = 'first-request-12345', href = 'tel:2125550123') => ({ requestId, locationId: '11111111-1111-4111-8111-111111111111', href, useOwnNumber: false });

test('parallel admissions share one destination capacity, with FIFO promotion after hangup', async () => {
  const f = fixture();
  const [one, two] = await Promise.all([f.service.create(context('a'), input()), f.service.create(context('b'), input())]);
  assert.equal(one.status, 'reserved'); assert.equal(two.status, 'queued');
  assert.equal(two.position, 1); assert.equal(f.history.dial.length, 0);
  await f.service.start(context('a'), one.id); assert.equal(f.history.dial.length, 1);
  await f.service.hangup(context('a'), one.id);
  assert.equal((await f.service.status(context('b'), two.id)).status, 'reserved');
});
test('capacity override permits two callers, but extensions and duplicate listings share main number', async () => {
  const f = fixture({ maxConcurrent: 4, capacity: { '+12125550123': 2 } });
  const calls = await Promise.all(['a', 'b', 'c'].map((name, index) => f.service.create(context(name), { ...input(`request-number-${index}`, `tel:2125550123;ext=${index}`), locationId: `${index}` })));
  assert.deepEqual(calls.map(call => call.status), ['reserved', 'reserved', 'queued']);
});
test('same session cannot call twice across tabs and repeated request/start is idempotent', async () => {
  const f = fixture(); const caller = context('a');
  const [one, replay] = await Promise.all([f.service.create(caller, input()), f.service.create(caller, input())]);
  assert.equal(one.id, replay.id);
  await assert.rejects(f.service.create(caller, input('different-request-123')), { code: 'call_in_progress' });
  await Promise.all([f.service.start(caller, one.id), f.service.start(caller, one.id)]);
  assert.equal(f.history.dial.length, 1);
  await assert.rejects(f.service.status(context('b'), one.id), { code: 'not_found' });
});
test('caller ID requires session OTP and cannot be set by request payload', async () => {
  const f = fixture(); const caller = context('a');
  await assert.rejects(f.service.create(caller, { ...input(), useOwnNumber: true }), { code: 'verification_required' });
  await f.service.requestVerification(caller, '(917) 555-0123');
  assert.equal((await f.service.confirmVerification(caller, '000000')).verified, false);
  assert.equal((await f.service.config(caller)).verifiedNumber, null);
  assert.equal((await f.service.confirmVerification(caller, '123456')).verified, true);
  const call = await f.service.create(caller, { ...input(), useOwnNumber: true, callerNumber: '+12125550000' });
  assert.equal(call.callerNumber, '+19175550123');
  await f.service.forget(caller);
  await assert.rejects(f.service.start(caller, call.id), { code: 'verification_required' });
});
test('shared and per-number OTP limits survive session reset', async () => {
  const f = fixture({ dailyOtp: 2 });
  await f.service.requestVerification(context('a'), '9175550123');
  await assert.rejects(f.service.requestVerification(context('b'), '9175550123'), { code: 'verification_pending' });
  await f.service.requestVerification(context('b'), '9175550124');
  await assert.rejects(f.service.requestVerification(context('c'), '9175550125'), { code: 'rate_limited' });
});
test('no telephone call before the expected participant publishes its microphone', async () => {
  const f = fixture(); const call = await f.service.create(context('a'), input());
  f.provider.participant = async () => ({ identity: 'someone-else', tracks: [{ type: 0, source: 2 }] });
  await assert.rejects(f.service.start(context('a'), call.id), { code: 'microphone_required' });
  assert.equal(f.history.dial.length, 0);
});
test('uncertain dial is never retried and holds capacity until bounded provider lifetime', async () => {
  const f = fixture(); let attempts = 0;
  f.provider.dial = async () => { attempts += 1; throw new Error('timeout after request sent'); };
  const one = await f.service.create(context('a'), input());
  assert.equal((await f.service.start(context('a'), one.id)).status, 'ending');
  await f.service.start(context('a'), one.id); assert.equal(attempts, 1);
  const two = await f.service.create(context('b'), input()); assert.equal(two.status, 'queued');
  f.advance(1100000); await f.service.reap();
  assert.equal(f.state().calls[one.id].status, 'ended');
});
test('abandoned reservation is reclaimed without calling and queued users lose stale places', async () => {
  const f = fixture(); const call = await f.service.create(context('a'), input());
  f.advance(46000); await f.service.reap();
  assert.equal((await f.service.status(context('a'), call.id)).status, 'ended');
  assert.equal(f.history.dial.length, 0);
});
test('global minute reservation is atomic and no new cookie can reset it', async () => {
  const f = fixture({ dailyMinutes: 16 });
  await f.service.create(context('a'), input());
  await assert.rejects(f.service.create(context('b'), input()), { code: 'rate_limited' });
});
test('config reads do not fill bounded session storage', async () => {
  const f = fixture(); await f.service.config(context('a')); assert.equal(Object.keys(f.state().sessions).length, 0);
});
test('signed lifecycle events bind room SID and identities and tolerate replay', async () => {
  const f = fixture(); const caller = context('a'); const result = await f.service.create(caller, input()); await f.service.start(caller, result.id);
  const call = f.state().calls[result.id];
  const event = { id: 'event-1', createdAt: Math.floor(f.now() / 1000), room: { name: call.roomName, sid: call.roomSid }, event: 'participant_left', participant: { identity: 'wrong' } };
  await f.service.webhook(JSON.stringify(event), 'sig'); assert.equal(f.history.close.length, 0);
  event.id = 'event-2'; event.participant.identity = call.browserIdentity;
  await f.service.webhook(JSON.stringify(event), 'sig'); await f.service.webhook(JSON.stringify(event), 'sig'); assert.equal(f.history.close.length, 1);
  f.provider.receiveWebhook = async () => { throw new Error('bad signature'); };
  await assert.rejects(f.service.webhook('{}', 'bad'), { code: 'invalid_webhook' });
});
test('directory rejects non-published, unrelated services, arbitrary hrefs and emergency numbers', async () => {
  const location = { id: input().locationId, organization_id: 'org', slug: 'office', description: '<a href="tel:2125550123;ext=007">Call</a>' };
  const models = { Location: { unscoped: () => ({ findByPk: async () => location }) }, EventRelatedInfo: { findOne: async () => null, findAll: async () => [{ event: 'OTHER_INFO', information: '<a href="tel:2125550199">Info number</a>' }] }, Phone: { findAll: async () => [] }, Sequelize: { Op: { or: Symbol('or') } }, ServiceAtLocation: { findOne: async () => null } };
  const directory = createDirectory(models);
  assert.equal((await directory({ ...input(), href: 'tel:2125550123;ext=007' })).extension, '007');
  assert.equal((await directory({ ...input(), href: 'tel:2125550199' })).number, '+12125550199');
  await assert.rejects(directory(input()));
  await assert.rejects(directory({ ...input(), href: 'tel:911' }));
  await assert.rejects(directory({ ...input(), serviceId: '22222222-2222-4222-8222-222222222222' }));
  location.hidden_from_search = true; await assert.rejects(directory({ ...input(), href: 'tel:2125550123;ext=007' }));
});
test('only actual supported linked numbers qualify and extension zeros survive', () => {
  assert.deepEqual(parseNumber('(917) 555-0123 x007'), { number: '+19175550123', extension: '007' });
  ['911', '112', '+442012345678', '9175550123@evil', '123', '+9175550123'].forEach(number => assert.equal(parseNumber(number), null));
  assert.equal(linkedNumbers('Call 2125550123').length, 0);
  assert.equal(linkedNumbers('<a href="tel:2125550123">call</a>').length, 1);
  [
    '<!-- <a href="tel:2125550123">call</a> -->',
    '<script>const x = `<a href="tel:2125550123">call</a>`;</script>',
    '<template><a href="tel:2125550123">call</a></template>',
    '<a data-href="tel:2125550123">call</a>',
    '[call](tel:2125550123)',
  ].forEach(html => assert.equal(linkedNumbers(html).length, 0));
  assert.equal(parseHref('https://evil.example/?a=nc&n=2125550123'), null);
});
test('provider parses unwrapped registration response and binds confirmation timestamp', async () => {
  const previous = global.fetch; const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') return new Response('{}', { status: 404 });
    return Response.json({ phone_number: '+19175550123', verification_method: 'sms' });
  };
  try {
    const provider = createProviders({ livekitUrl: 'wss://calls.example.org', livekitKey: 'key', livekitSecret: 'test'.repeat(16), telnyxKey: 'test' });
    assert.deepEqual(await provider.requestVerification('+19175550123'), { mode: 'registration' });
    assert.equal(requests.length, 2);
  } finally { global.fetch = previous; }
});
test('browser token only joins one audio room and carries no SIP permission', async () => {
  const provider = createProviders({ livekitUrl: 'wss://calls.example.org', livekitKey: 'key', livekitSecret: 'test'.repeat(16) });
  const token = await provider.token({ roomName: 'one-call', browserIdentity: 'one-visitor' });
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.equal(claims.video.room, 'one-call'); assert.equal(claims.video.roomJoin, true);
  assert.deepEqual(claims.video.canPublishSources, ['microphone']);
  assert.equal(claims.video.roomAdmin, false); assert.equal(claims.sip, undefined);
});
test('internal endpoints fail closed without the BFF secret', async () => {
  const f = fixture(); const app = express(); app.use(express.json());
  app.use('/public-calling', createRouter({ config: f.config, provider: f.provider, store: f.store, models: {}, directory: async () => ({}) }));
  assert.equal(sameSecret('bad', f.config.secret), false);
  assert.equal((await supertest(app).post('/public-calling/calls').send(input())).status, 401);
  assert.equal((await supertest(app).get('/public-calling/config').set('x-public-calling-secret', f.config.secret).set('x-public-calling-session', context('a').session).set('x-public-calling-client-ip', context('a').ip)).status, 200);
});
