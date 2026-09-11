// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
// Node 20+. Default is an offline plan. --apply creates dedicated resources only.
import { mkdir, open, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { SipClient } from 'livekit-server-sdk';
import { SIPTransport, SIPMediaEncryption } from '@livekit/protocol';

export function plan(env = process.env) {
  const environment = env.PUBLIC_CALLING_ENVIRONMENT || 'stage';
  if (!/^(stage|prod)$/.test(environment)) throw new Error('Choose stage or prod explicitly.');
  const number = (name, fallback, min, max) => {
    const value = Number(env[name] || fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
    return value;
  };
  const concurrent = number('PUBLIC_CALLING_MAX_CONCURRENT', 2, 1, 100);
  if (!Number.isInteger(concurrent)) throw new Error('Concurrency must be an integer.');
  return {
    name: `yourpeer-public-${environment}`, environment, concurrent,
    outbound: {
      name: `yourpeer-public-${environment}`, enabled: true,
      traffic_type: 'conversational', service_plan: 'global', usage_payment_method: 'rate-deck',
      whitelisted_destinations: ['US'], concurrent_call_limit: concurrent,
      daily_spend_limit_enabled: true,
      daily_spend_limit: number('PUBLIC_CALLING_TELNYX_DAILY_SPEND', 2, 0.01, 100).toFixed(2),
      max_destination_rate: number('PUBLIC_CALLING_TELNYX_MAX_RATE', 0.02, 0.001, 1),
    },
    verifySpend: number('PUBLIC_CALLING_TELNYX_VERIFY_DAILY_SPEND', 1, 0.01, 100),
  };
}

export function checkSubset(actual, expected, path = 'resource') {
  for (const [key, value] of Object.entries(expected)) {
    const other = actual?.[key];
    if (Array.isArray(value)) {
      if (!Array.isArray(other) || JSON.stringify([...other].sort()) !== JSON.stringify([...value].sort())) throw new Error(`Configuration drift at ${path}.${key}; review in provider console.`);
    } else if (value && typeof value === 'object') checkSubset(other, value, `${path}.${key}`);
    else if (typeof value === 'number' || key === 'daily_spend_limit') {
      if (Number(other) !== Number(value)) throw new Error(`Configuration drift at ${path}.${key}.`);
    } else if (other !== value) throw new Error(`Configuration drift at ${path}.${key}.`);
  }
}

async function apply(settings, env) {
  const required = (name, min = 1) => {
    const value = env[name] || '';
    if (value.length < min || /[\r\n\0]/.test(value) || value.includes('replace-with')) throw new Error(`Set ${name}.`);
    return value;
  };
  const key = required('PUBLIC_CALLING_TELNYX_API_KEY');
  const user = required('PUBLIC_CALLING_SIP_USERNAME');
  const password = required('PUBLIC_CALLING_SIP_PASSWORD', 32);
  if (!/^[a-zA-Z0-9]{4,32}$/.test(user) || password.length > 128) throw new Error('Invalid SIP credentials.');
  const caller = required('PUBLIC_CALLING_CALLER_NUMBER');
  if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(caller)) throw new Error('Use a full approved +1 caller number.');
  const livekitUrl = new URL(required('PUBLIC_CALLING_LIVEKIT_URL'));
  if (livekitUrl.protocol !== 'wss:' || livekitUrl.username || livekitUrl.password || livekitUrl.search || livekitUrl.hash || livekitUrl.pathname !== '/') throw new Error('Use the dedicated wss:// gateway hostname.');
  const sip = new SipClient(livekitUrl.toString().replace(/^wss:/, 'https:'), required('PUBLIC_CALLING_LIVEKIT_API_KEY', 12), required('PUBLIC_CALLING_LIVEKIT_API_SECRET', 32), { timeout: 15 });
  const template = required('PUBLIC_CALLING_TELNYX_VERIFY_TEMPLATE_ID');
  if (!/^[a-f\d-]{36}$/i.test(template)) throw new Error('Select a Verify template ID from Telnyx.');
  const root = fileURLToPath(new URL('../infrastructure/public-calling/runtime/', import.meta.url));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lockPath = join(root, `provision-${settings.environment}.lock`);
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Provisioning lock exists. Check for an active process before removing that lock.'); });
  const statePath = join(root, `provision-${settings.environment}.json`);
  try {
    let state;
    try { state = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = {}; }
    const save = () => writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    const request = async (path, body) => {
      let response;
      try {
        response = await fetch(`https://api.telnyx.com/v2${path}`, {
          method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch { throw new Error('Telnyx request outcome uncertain. Inspect the saved journal before retrying.'); }
      if (response.status === 404 && !body) return null;
      if (!response.ok) throw new Error(`Telnyx returned HTTP ${response.status}. No automatic retry was made.`);
      return response.json();
    };
    // Number purchases, verification messages, number routing and staff resources are untouched.
    const verified = await request(`/verified_numbers/${encodeURIComponent(caller)}`);
    if (!verified?.data?.verified_at) {
      const owned = await request(`/phone_numbers?filter[phone_number]=${encodeURIComponent(caller)}`);
      if (!owned?.data?.some(item => item.phone_number === caller)) throw new Error('Default caller must already be owned or verified on this Telnyx account.');
    }
    const ensure = async (kind, expected, nameField = 'name') => {
      let existing;
      const record = state[kind];
      if (record?.id) existing = (await request(`/${kind}/${encodeURIComponent(record.id)}`))?.data;
      else {
        const matches = [];
        for (let page = 1; page <= 100; page++) {
          const result = await request(`/${kind}?page[size]=250&page[number]=${page}`);
          if (!Array.isArray(result?.data)) throw new Error(`Cannot list ${kind}.`);
          matches.push(...result.data.filter(item => item[nameField] === settings.name));
          if (result.data.length < 250) break;
          if (page === 100) throw new Error('Provider inventory too large for automatic provisioning.');
        }
        if (matches.length > 1 || (matches.length && !record?.pending)) throw new Error(`Existing ${kind} name is not owned by this journal. Inspect it before proceeding.`);
        [existing] = matches;
        if (!existing && record?.pending) throw new Error(`Uncertain ${kind} creation. Confirm its outcome before clearing this journal entry.`);
      }
      if (!existing) {
        if (record?.id) throw new Error(`Previously provisioned ${kind} is missing.`);
        state[kind] = { pending: true }; await save();
        existing = (await request(`/${kind}`, expected))?.data;
        if (!existing?.id) throw new Error(`Uncertain ${kind} response; inspect provider and journal.`);
      }
      state[kind] = { id: existing.id }; await save();
      const current = (await request(`/${kind}/${encodeURIComponent(existing.id)}`))?.data;
      checkSubset(current, expected, kind);
      return current;
    };
    const profile = await ensure('outbound_voice_profiles', settings.outbound);
    await ensure('credential_connections', {
      connection_name: settings.name, active: true, user_name: user, password,
      encrypted_media: 'SRTP', dtmf_type: 'RFC 2833', sip_uri_calling_preference: 'disabled',
      outbound: { outbound_voice_profile_id: profile.id, channel_limit: settings.concurrent, call_parking_enabled: false, localization: 'US' },
    }, 'connection_name');
    const verify = await ensure('verify_profiles', {
      name: settings.name, language: 'en-US', daily_spend_limit_enabled: true, daily_spend_limit: settings.verifySpend,
      sms: { messaging_template_id: template, app_name: 'YourPeer', code_length: 6, default_verification_timeout_secs: 300, whitelisted_destinations: ['US'] },
    });
    const trunks = (await sip.listSipOutboundTrunk()).filter(trunk => trunk.name === settings.name);
    if (trunks.length > 1 || (trunks.length && !state.trunk)) throw new Error('Existing LiveKit trunk is not owned by this journal.');
    let [trunk] = trunks;
    const options = { authUsername: user, authPassword: password, transport: SIPTransport.SIP_TRANSPORT_TLS, mediaEncryption: SIPMediaEncryption.SIP_MEDIA_ENCRYPT_REQUIRE };
    if (!trunk) {
      if (state.trunk) throw new Error('Uncertain/missing LiveKit trunk. Inspect provider before retrying.');
      state.trunk = { pending: true }; await save();
      // Wildcard permits server-selected, OTP-verified caller IDs. No public token has SIP grants.
      trunk = await sip.createSipOutboundTrunk(settings.name, 'sip.telnyx.com', ['*'], options);
    }
    checkSubset(trunk, { name: settings.name, address: 'sip.telnyx.com', numbers: ['*'], ...options }, 'LiveKit trunk');
    state.trunk = { id: trunk.sipTrunkId }; await save();
    console.log(`PUBLIC_CALLING_LIVEKIT_TRUNK_ID=${trunk.sipTrunkId}\nPUBLIC_CALLING_TELNYX_VERIFY_PROFILE_ID=${verify.id}`);
    console.log('Dedicated resources configured. Website/API remain disabled until rollout. No calls or messages sent.');
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.slice(2).some(arg => !['--plan', '--apply'].includes(arg)) || (process.argv.includes('--plan') && process.argv.includes('--apply'))) throw new Error('Usage: node scripts/configure-public-calling.mjs [--plan | --apply]');
    const settings = plan();
    if (!process.argv.includes('--apply')) console.log(JSON.stringify({ mode: 'offline plan', ...settings, creates: ['dedicated Telnyx outbound profile', 'dedicated SIP connection with TLS/SRTP', 'US SMS Verify profile', 'server-only LiveKit outbound trunk'], activation: 'separate website/API flags; no number purchase, routing change, call or SMS' }, null, 2));
    else await apply(settings, process.env);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
