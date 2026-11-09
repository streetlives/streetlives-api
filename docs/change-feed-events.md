# Immediate change notifications

The timestamp feeds from #255 remain the replay/reconciliation path. This optional
push path sends committed metadata rows immediately, without waiting for the feed's
settling horizon or re-reading location details in the extension.

## Flags and deployment

All environments default to **off**. Stage and production require separate receiver
URLs and signing secrets. Deploy the migration and API code with the flag off first.

| Variable | Value |
| --- | --- |
| `CHANGE_FEED_EVENTS_ENABLED` | `true` to enqueue and deliver; absent/false disables both |
| `CHANGE_FEED_EVENTS_STAGE` | Explicit `Stage` or `prod`; never inferred from NODE_ENV |
| `CHANGE_FEED_EVENTS_URL` | HTTPS endpoint for that environment's consumer |
| `CHANGE_FEED_EVENTS_SECRET` | At least 32 characters; provided through existing secret configuration |

The receiver must exist before enabling delivery. API deployments alone do not
enable the feature or change existing change-feed access rules.
Keep `8r2052sia5av7u5ldvqcmq7dg` in `CHANGE_FEED_ALLOWED_CLIENT_IDS` for replay access.

Deploy `cloudformation/change-feed-events-retry.yaml` once per environment with
the exact API Lambda ARN. It creates a disabled one-minute retry rule; set its
`Enabled` parameter to true when enabling delivery. This job queries only the
indexed pending delivery queue, never the locations catalogue.

For a one-time retry, invoke that Lambda with:

```json
{"source":"streetlives.change-feed-retry","detail-type":"Retry metadata event delivery"}
```

## Delivery contract

Metadata remains the audit source. `metadata_event_deliveries` stores only its ID,
attempt count and delivery timestamps; it is a retry receipt, not a second change log.
The receipt is inserted in the same transaction as the metadata. Rollback removes
both. After the outer transaction commits, the API attempts one bounded batch of
up to 20 edits, with a three-second HTTPS deadline. A failed notification does not
make a committed edit look like a failed save. Remaining/failed work stays queued.

The payload has `type: streetlives.metadata.changed`, `version: 1`, an explicit
`stage`, and `edits`. Each edit has the same fields/attribution as `/location-edits`,
plus `version` preserving the exact metadata timestamp. The immutable metadata `id`
is the deduplication key. Large field values become `requires_refetch: true` with
both values null; these nulls are not instructions to clear a field.

The sender signs the exact UTF-8 JSON bytes with HMAC-SHA256 over
`<X-Streetlives-Timestamp>.<body>`. `X-Streetlives-Signature` is `sha256=<hex>`.
The receiver must verify the signature using a constant-time comparison, enforce
a short timestamp tolerance, and reject the wrong stage before processing.
HTTP 200/202/204 acknowledges **durable** ownership, not an in-memory task.
Redirects and other statuses remain retryable. Delivery is at least once.

The consumer must deduplicate by metadata ID and protect against delayed or
reordered events. Apply a field directly only for a supported resource/field,
with a valid type, a matching previous cached value, and an unambiguous newer
version. Equal timestamps, uncertain ordering, relationship changes, creates,
deletes, missing attribution and `requires_refetch` require a targeted refresh.
Do not advance the replay cursor from these events. New and deleted locations,
shared organization fan-out, service moves and audit attribution still need the
normal cache publication/index maintenance. Firebase can then notify open tabs.

## Coverage and recovery

The Sequelize Metadata create/bulk-create hooks cover API writes, including
service-deletion metadata. When enabled, those writes must use a transaction.
Raw SQL that bypasses Sequelize hooks and time-based holiday expiry still rely
on the replay feed. Keep that safety net enabled; push does not replace it.
Do not discard an entire replay page just because some edits arrived by push.

Monitor `change_feed_delivery_batch`, `change_feed_delivery_failed` and
`change_feed_after_commit_failed` logs, plus pending count/oldest queue age.
Turning the flag off pauses sending and new enqueueing without deleting pending
receipts. Turning it on resumes undelivered work. Keep receipts until consumers'
deduplication/replay retention requirements are established.

## Stage verification

With the extension's cache-sync code gate off, enable the receiver and sender only
for Stage. Check a location field edit, service edit, shared organization edit,
addition and deletion. Verify before/after values, editor attribution, deduplication,
out-of-order delivery, a receiver outage/retry, and transaction rollback. Verify
production remains unchanged. Only then enable the separate production flag.

The isolated database test uses ordinary PostgreSQL and no PostGIS/real data:

```powershell
$env:CHANGE_FEED_TEST_DATABASE_NAME='change_feed_events_test'
$env:CHANGE_FEED_TEST_DATABASE_PORT='55439'
node --test test/database/change-feed-events.test.cjs
```

It refuses any other database name and connects only to loopback. Provision that
disposable database for local testing; the test recreates only its metadata tables.
