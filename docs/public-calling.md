# Public YourPeer calling

This is an opt-in pilot. Merge/deploy with `PUBLIC_CALLING_ENABLED=false` until the gateway, trusted website ingress and acceptance checks below are complete. The companion YourPeer PR supplies the same-origin browser routes and call panel. No staff extension configuration is changed.

## Call path and authority

Desktop directory link → microphone permission plus optional callback OTP → YourPeer Next.js BFF → this API → LiveKit audio room → server-created SIP participant → dedicated Telnyx connection. A browser gets a 60-second token to join one existing room with microphone/audio/data permissions; it gets no SIP, room-creation or administrative grants. LiveKit data is needed for keypad DTMF. Recording, incoming browser calls and messaging are not enabled.

The API re-reads the published location/service before reservation and again before dialing. Only full supported phone numbers in associated phone records or hyperlinks in descriptions, additional information and event-related information qualify. Extensions remain separate from the normalized destination used for capacity. Origin and listing IDs provide context, not proof of a human: the BFF also verifies Turnstile hostname/action and forwards its own signed-cookie session and trusted client IP under a server secret. Direct API requests without that secret fail, except cryptographically authenticated LiveKit webhooks.

The emergency boundary is the server-controlled SIP leg. Telnyx emergency dialing cannot be made safe merely by parking or hiding a JavaScript dial button. Public visitors never get Telnyx/SIP credentials; short codes, emergency numbers, SIP URIs and unlisted destinations are rejected server-side. The page tells visitors to call 911 on their phone. Do not replace the audio room token with a Telnyx browser token.

## Dedicated gateway

Use a dedicated Linux host with a public IPv4 address near New York, Docker Engine and Compose v2. A small pilot can start with 2 vCPU / 4 GB, but measure load before increasing concurrency. This host and its data transfer are an additional hosting cost; this setup is not calls-only billing. Existing staff calling can share the Telnyx account, but must retain its own connection/profile and credentials.

1. Point **DNS-only** `calls.<domain>` and `turn.<domain>` records to the gateway. Do not proxy WebRTC/TURN through the ordinary Cloudflare HTTP proxy. Obtain a publicly trusted certificate with both names; place the full chain followed by its private key in `infrastructure/public-calling/certs/gateway.pem`. Restrict the directory to its operator and arrange automatic renewal plus HAProxy reload. No certificate or VM is purchased by this PR.
2. Copy `infrastructure/public-calling/.env.example` to a private file outside git. Set real hostnames and API stage URL. Generate distinct random secrets for Redis, LiveKit and the BFF; use at least 32 random characters. Use an alphanumeric Redis secret. Load this file into Node with `--env-file=/secure/public-calling.env` (Node 20.6+).
3. Render: `node --env-file=/secure/public-calling.env infrastructure/public-calling/render-config.mjs`. Generated runtime files are private and ignored. Keep the real env file outside the repository as well.
4. Run `docker compose -f infrastructure/public-calling/compose.yaml up -d`. Versions/digests are pinned. Back up Redis and the provisioning journal, and monitor container health, disk, certificate expiry and the reaper's health check.
5. Firewall: allow inbound TCP 443 (TLS signaling and TURN), TCP 7881 (WebRTC fallback), UDP 443 (TURN), UDP 50000–60000 (WebRTC), UDP 20001–30000 (TURN relay), and UDP 10000–20000 (SIP RTP, preferably constrained to current Telnyx media networks). Allow outbound DNS, HTTPS, Telnyx SIP TLS 5061 and required RTP. Restrict SSH to operators. Keep Redis 6379, LiveKit 7880, internal TURN 5349 and unsolicited SIP 5060 unreachable from the internet. No inbound SIP trunks or dispatch rules are created. Host networking is required by this compose file.

HAProxy routes TLS 443 by SNI: signaling to localhost:7880, TURN to localhost:5349. LiveKit 1.13.6 advertises TURN TLS on external port 443; `external_tls: true` accepts plaintext only behind the TLS terminator. Do not advertise port 5349 or expose it directly. `room.auto_create=false` prevents old room tokens from recreating deleted rooms. Credentials and room grants are separate from TURN's short-lived authentication.

## Provider setup command

Run from this repository after `npm ci` on Node 20+:

```sh
node --env-file=/secure/public-calling.env scripts/configure-public-calling.mjs --plan
node --env-file=/secure/public-calling.env scripts/configure-public-calling.mjs --apply
```

The default plan is offline. Apply creates `yourpeer-public-stage` or `yourpeer-public-prod` resources only: a US-only, metered outbound profile (default 2 channels, $2/day, $0.02/min destination ceiling), a dedicated credential SIP connection, an SMS Verify profile ($1/day default), and a TLS/SRTP LiveKit outbound trunk. Review current carrier rates and actual account limits before applying; requested limits may require an account upgrade. These budgets do not include hosting or guarantee every US destination is affordable/reachable. First-time external caller-ID registration uses Telnyx Verified Numbers and its account-level limits; subsequent visitor ownership checks use the dedicated Verify profile. Application OTP quotas apply to both.

Choose a currently supported Verify SMS template using `GET /v2/verify_profiles/templates` and put its ID in `PUBLIC_CALLING_TELNYX_VERIFY_TEMPLATE_ID`. Provide `PUBLIC_CALLING_SIP_USERNAME` (4–32 alphanumeric characters) and a newly generated `PUBLIC_CALLING_SIP_PASSWORD` (32–128 characters). `PUBLIC_CALLING_CALLER_NUMBER` must already be owned or verified on the account and appropriate to display as YourPeer. **Do not silently use an employee's personal Google Voice number.** Establish the default number's existing callback/voicemail handling before launch; this feature does not supply incoming-call routing.

Apply prints only the resulting LiveKit trunk and Verify profile IDs. Its private journal in ignored `runtime/` records resources it owns and pending operations. Re-running validates rather than overwrites existing settings. On uncertain creation, it stops; inspect the provider console before clearing a pending journal entry. Do not delete the journal to force a retry. Use one operator/machine at a time. Existing name collisions and configuration drift stop provisioning. No calls, OTPs, purchases, ports, employee edits or number-routing changes occur in this command.

The LiveKit trunk has caller numbers `['*']` so the server can supply the visitor's verified callback number. This is safe only behind the API's caller-ID check and server-only credentials. The Telnyx connection must have no ANI override that replaces visitor caller IDs. Inspect caller ID on an acceptance call: successful room connection alone is not proof the carrier honored it.

## API deployment

Deploy through the existing AWS release process. First run the new Sequelize migration `20260911000000-create-public-calling-state.js` against the intended environment using the established migration command. It creates a private JSONB state table; it changes no directory data. Never use the test suite's database setup against a production database.

Add the `/public-calling/{proxy+}` greedy resource from `simple-proxy-api.yaml` to API Gateway and deploy its intended stage. Its method authorization is `NONE` so BFF-secret authentication and signed webhooks reach Express; keep existing routes' Cognito configuration intact. Existing deployments do not automatically import this YAML when Lambda code is uploaded. Review an API Gateway export/diff and apply this specific route instead of replacing unrelated API resources. Use the existing Lambda proxy integration and invocation permission. Do not enable request-body logging for calling routes.

Set API runtime configuration, all server-side:

| Variable | Value |
| --- | --- |
| `PUBLIC_CALLING_ENABLED` | `false` until acceptance; `true` to admit calls |
| `PUBLIC_CALLING_BFF_SECRET` | Same random secret as website `PUBLIC_CALLING_SECRET` and gateway reaper |
| `PUBLIC_CALLING_HASH_SECRET` | Independent ≥32-character random secret; stable across API instances |
| `PUBLIC_CALLING_LIVEKIT_URL` | Dedicated `wss://calls.<domain>` |
| `PUBLIC_CALLING_LIVEKIT_API_KEY`, `PUBLIC_CALLING_LIVEKIT_API_SECRET` | Dedicated gateway signing credentials |
| `PUBLIC_CALLING_LIVEKIT_TRUNK_ID` | Provisioning output |
| `PUBLIC_CALLING_CALLER_NUMBER` | Approved default caller, full `+1…` |
| `PUBLIC_CALLING_TELNYX_API_KEY` | Telnyx key kept in the server secret store |
| `PUBLIC_CALLING_TELNYX_VERIFY_PROFILE_ID` | Provisioning output |
| `PUBLIC_CALLING_MAX_CONCURRENT` | Default 2; at or below carrier/host capacity |
| `PUBLIC_CALLING_MAX_CALL_SECONDS` | Default 900 (15 minutes) |
| `PUBLIC_CALLING_DAILY_MINUTES`, `PUBLIC_CALLING_DAILY_CALLS` | Defaults 120 and 60 |
| `PUBLIC_CALLING_DAILY_OTP` | Default 40 |
| `PUBLIC_CALLING_DESTINATION_CAPACITIES` | JSON mapping verified call-center main numbers to capacity, e.g. `{"+12125550123":2}`; default 1 |

Admission, deduplication, queueing, OTP cooldowns and quotas use a transaction plus PostgreSQL advisory lock across all API instances. This single-row design is deliberately a bounded pilot (2,048 stored sessions/calls). Before broad launch, load-test and replace the singleton with indexed relational records if needed. A larger-looking organization does not automatically receive a larger capacity; confirm capacity with its operator. A user waiting here is in YourPeer's queue, not the organization's own phone queue.

The minute budget reserves worst-case ringing + call duration at admission and does not refund reservations. With defaults this is 16 minutes per request, so a 120-minute budget admits at most seven requests per UTC day, including cancelled/queued ones. Raise only after evaluating the pilot; daily call quota is an additional ceiling. A session gets eight requests/day, an IP 30/day, and a destination 20/day per configured capacity. New cookies do not reset global/IP/destination caps. Shared-network users can share the IP cap.

The gateway reaper calls secret-protected `POST /public-calling/reap` every 30 seconds. It must stay healthy even while admissions are disabled. Signed webhooks, browser hangup, missing-participant cleanup and a provider maximum duration end calls. A timed-out carrier dial is never blindly retried; its capacity stays held until the bounded maximum lifetime. Alert on repeated reaper failures and stale `ending` calls. Keep the gateway outside an idle/sleep hosting plan.

## Website boundary and rollout

Configure the companion website BFF according to its `docs/public-calling.md`, including a managed Turnstile widget restricted to its exact hostname. Cloudflare must overwrite `CF-Connecting-IP`, and the application origin must reject bypass traffic. On platforms whose default deployment hostname remains public, use origin access controls or an ingress secret validated by that platform; merely trusting a header named `CF-Connecting-IP` is insufficient. Without a verified trusted-IP path, keep calling disabled. Apply Cloudflare rate limiting to `/api/public-calling/*`, particularly `/calls` and `/verification/request`, in addition to API quotas. Do not cache those routes.

1. Run `node --test test/public-calling/*.node.cjs`, API build and relevant lint. CI also runs the opt-in local PostgreSQL concurrency test using isolated temporary schemas.
2. Deploy API/gateway with website calling off, then validate TLS, TURN over a UDP-blocked network, signed webhook delivery, reaper health, and provider resource settings. No browser may receive a SIP credential or arbitrary-room/admin token.
3. Enable for a controlled hostname/pilot. Using consenting test destinations actually stored on that test listing, verify two-way audio, microphone denial, hangup, browser close, DTMF including leading-zero extensions, callback OTP rejection/success, caller ID on the receiving phone, queue ordering across browsers, same-number capacity, timeout recovery, and per-call duration. No emergency calls are part of this checklist. Verify 911/112/SIP/foreign/unlisted inputs are rejected without a carrier request.
4. After acceptance, enable production API then website. Set the API flag false to stop admissions while keeping status, hangup, webhook and reaper available. For rollback, disable new calls first, wait for active/ending calls to drain, then disable the website. Retain migration/state and gateway until drained; do not drop the table during active calls.

No call audio is stored. The state retains calls for 24 hours, verification numbers for up to 30 days, and rate-limit buckets for cleanup. Session/IP identifiers are HMACed; call destinations and verified callback numbers remain personal data in the private DB and carrier records. Limit access and document this processing in the website privacy notice before public launch. Remembering a number is opt-in; shared computers should use a session-only cookie or forget it after use. Caller ID does not port the number: callbacks/messages still arrive at the visitor's existing phone provider.

Official references: [Telnyx SIP connections](https://developers.telnyx.com/api-reference/credential-connections/create-a-credential-connection), [outbound profiles](https://developers.telnyx.com/api-reference/outbound-voice-profiles/create-an-outbound-voice-profile), [Verify](https://developers.telnyx.com/api-reference/verify/create-a-verify-profile), [LiveKit SIP deployment](https://docs.livekit.io/transport/self-hosting/sip-server/), [outbound trunks](https://docs.livekit.io/telephony/making-calls/outbound-trunk/), [LiveKit 1.13.6 TURN advertisement](https://github.com/livekit/livekit/blob/v1.13.6/pkg/service/roommanager.go).
