import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const marker = '/tmp/public-calling-reaper-health';
if (process.argv.includes('--healthcheck')) {
  let healthy = false;
  try { healthy = Date.now() - Number(await readFile(marker, 'utf8')) < 90000; } catch { /* first run */ }
  process.exit(healthy ? 0 : 1);
}
const endpoint = new URL(process.env.PUBLIC_CALLING_REAPER_URL || '');
const secret = process.env.PUBLIC_CALLING_BFF_SECRET || '';
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || secret.length < 32) {
  throw new Error('Configure the HTTPS reaper endpoint and backend shared secret.');
}
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
while (!stopping) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-public-calling-secret': secret },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(marker, String(Date.now()));
  } catch (error) {
    // Never print response bodies, credentials, or caller data.
    console.error(`Public calling reaper failed (${error.name}); investigate gateway/API health.`);
  }
  if (!stopping) await delay(30000);
}
