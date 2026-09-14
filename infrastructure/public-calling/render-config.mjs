import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const env = process.env;
const required = (name, minimum = 1) => {
  const value = env[name] || '';
  if (value.length < minimum || /[\r\n\0]/.test(value) || value.includes('replace-with')) {
    throw new Error(`Set ${name} before rendering gateway configuration.`);
  }
  return value;
};
const livekitUrl = new URL(required('PUBLIC_CALLING_LIVEKIT_URL'));
if (livekitUrl.protocol !== 'wss:' || livekitUrl.port || livekitUrl.pathname !== '/') {
  throw new Error('PUBLIC_CALLING_LIVEKIT_URL must be a wss:// hostname on port 443.');
}
const domain = livekitUrl.hostname;
const turnDomain = required('PUBLIC_CALLING_TURN_DOMAIN');
const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
if (!hostname.test(domain) || !hostname.test(turnDomain) || domain === turnDomain) {
  throw new Error('Use two different public DNS hostnames for signaling and TURN.');
}
const apiBase = new URL(required('PUBLIC_CALLING_API_BASE_URL'));
if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password
  || apiBase.search || apiBase.hash) throw new Error('Use an HTTPS API base URL.');
const apiUrl = apiBase.toString().replace(/\/$/, '');
const key = required('PUBLIC_CALLING_LIVEKIT_API_KEY', 12);
const secret = required('PUBLIC_CALLING_LIVEKIT_API_SECRET', 32);
const bffSecret = required('PUBLIC_CALLING_BFF_SECRET', 32);
const redisPassword = required('PUBLIC_CALLING_REDIS_PASSWORD', 32);
if (!/^[A-Za-z0-9_-]+$/.test(redisPassword)) {
  throw new Error('PUBLIC_CALLING_REDIS_PASSWORD must use letters, digits, _ or -.');
}
const redis = { address: '127.0.0.1:6379', password: redisPassword };
const files = {
  'livekit.yaml': JSON.stringify({
    port: 7880,
    bind_addresses: ['127.0.0.1'],
    logging: { level: 'warn' },
    rtc: { tcp_port: 7881, port_range_start: 50000, port_range_end: 60000, use_external_ip: true },
    redis,
    keys: { [key]: secret },
    room: { auto_create: false, empty_timeout: 60, departure_timeout: 20, max_participants: 2 },
    turn: {
      enabled: true, domain: turnDomain, tls_port: 5349, external_tls: true,
      udp_port: 443, relay_range_start: 20001, relay_range_end: 30000,
      per_user_relay_allocation_limit: 4,
    },
    webhook: { api_key: key, urls: [`${apiUrl}/public-calling/webhook`] },
  }, null, 2),
  'sip.yaml': JSON.stringify({
    api_key: key, api_secret: secret, ws_url: 'ws://127.0.0.1:7880', redis,
    sip_port: 5060, rtp_port: '10000-20000', use_external_ip: true,
    logging: { level: 'warn' },
  }, null, 2),
  'redis.conf': `bind 127.0.0.1\nprotected-mode yes\nport 6379\nrequirepass ${redisPassword}\nappendonly yes\ndir /data\n`,
  'haproxy.cfg': `global
  log stdout format raw local0 warning
  maxconn 1024
  ssl-default-bind-options ssl-min-ver TLSv1.2
defaults
  mode tcp
  timeout connect 10s
  timeout client 65m
  timeout server 65m
frontend calling_tls
  bind :443 ssl crt /etc/calling-certs/gateway.pem
  acl signaling ssl_fc_sni -i ${domain}
  acl turn ssl_fc_sni -i ${turnDomain}
  tcp-request content reject if !signaling !turn
  use_backend turn_backend if turn
  default_backend signaling_backend
backend signaling_backend
  server livekit 127.0.0.1:7880 check
backend turn_backend
  server livekit_turn 127.0.0.1:5349 check
`,
  'reaper.env': `PUBLIC_CALLING_REAPER_URL=${apiUrl}/public-calling/reap\nPUBLIC_CALLING_BFF_SECRET=${bffSecret}\n`,
};
await mkdir(join(root, 'runtime'), { recursive: true, mode: 0o700 });
await mkdir(join(root, 'certs'), { recursive: true, mode: 0o700 });
for (const [name, contents] of Object.entries(files)) {
  await writeFile(join(root, 'runtime', name), `${contents.trimEnd()}\n`, { mode: 0o600 });
}
console.log('Gateway configuration rendered into ignored runtime/. No external requests were made.');
