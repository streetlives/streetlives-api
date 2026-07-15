# Natural-language search: data flow & privacy policy

`GET /locations?naturalLanguageQuery=...` sends the query text to the OpenAI
API (`parseNaturalLanguageQuery` in `src/controllers/openai.js`) to extract
structured search filters (taxonomy, street address, neighborhood, open
time, eligibility, etc). This is the only place in the codebase where
user-supplied free text leaves Streetlives infrastructure to a third party.
This document describes what is sent, what is deliberately withheld or
redacted, and what is required of any client (web/mobile app) before
exposing this feature to end users.

## What is sent to OpenAI

- The raw `naturalLanguageQuery` string, **after** redaction (see below).
- The current datetime (America/New_York), used to resolve relative
  expressions like "tonight".

Nothing else — no user identity, session, IP, or account data is included
in the request.

## Consent model: sending the query is the consent signal

There is no separate consent parameter. Populating `naturalLanguageQuery`
**is** the caller's acknowledgment that the query text (after redaction)
is sent to OpenAI — a client must only populate it after showing the user
the notice described below. The API has no way to verify that happened,
so this is a contract with API consumers, not a substitute for them
actually asking. A client that has not shown the notice must send the
user's text as `searchString` instead, which is only ever used as a local
keyword search (`ILIKE`/`tsvector` against Postgres) and never reaches a
third party.

The former `naturalLanguageConsent` parameter has been removed and is now
ignored if sent — including `naturalLanguageConsent=false`, which no
longer suppresses the OpenAI call. Clients that relied on it to gate
consent must instead withhold `naturalLanguageQuery` itself until the
user has seen the notice.

## Data-minimization and abuse controls in place

- **Length cap**: queries over 500 characters are rejected before any
  processing (`src/controllers/validation/locations.js`).
- **PII redaction**: `src/utils/redact-pii.js` strips, in order, email
  addresses, US and international phone numbers, SSNs (dashed and
  unformatted), card-like numbers, and — as a catch-all — any other
  standalone run of 7+ digits (covers passport numbers, account numbers,
  and other ID-like sequences the specific patterns above miss). See that
  file's tests (`test/unit/redact-pii.test.js`) for the exact formats
  covered.
- **No raw-query logging**: the query text (redacted or not) is never
  written to logs; only guard/error states are (`NL query: ...` warnings
  in `src/controllers/openai.js`).
- **Rate limiting / circuit breaker**: `src/controllers/nl-limiter.js` caps
  how often the endpoint can call OpenAI, cross-instance (shared across all
  Lambda instances via Postgres), independent of redaction — both a global
  cap (60 uncached calls/min) and a **per-client cap** (8 uncached
  calls/min, keyed on a hash of the caller's IP via
  `src/utils/request.js`) so one caller cannot consume the entire global
  budget and deny NL parsing to everyone else.
- **Bounded retention of client keys**: the per-client rows above are the
  only place a client identifier (even hashed) is stored. The hash is
  scoped to the UTC day, so a stored key cannot be linked across days and
  enumerating the IPv4 space only resolves a key to (IP, single day), and
  expired rows are swept automatically from the admission path after a
  short TTL (`clientRowTtlMs`, minutes) — there is no unbounded
  accumulation of pseudonymous identifiers and no separate cleanup job to
  operate.
- **Fails closed**: if the shared Postgres-backed limiter is itself
  unavailable, admission checks (`allowInWindow`, `allowClientInWindow`,
  `isCircuitOpen`) deny the OpenAI call rather than allowing it through.
  A DB outage degrades natural-language search to plain keyword search
  for everyone, rather than letting Lambda's per-instance concurrency
  amplify unmetered, unbounded paid OpenAI calls during that outage.
- **Caching**: successful results are cached (keyed on the *redacted*
  query) for a few minutes, so a repeated query is not re-sent.

## Known limitations — read before relying on this for compliance

Redaction here is regex-based and best-effort. It reliably catches
*structured* PII (the formats listed above) but **cannot** detect:

- Names, or other free-text personal identifiers.
- Non-US/non-structured address or ID formats not covered by the patterns.
- Sensitive content that doesn't look like the patterns above (e.g. "I'm
  fleeing domestic violence and need a shelter that doesn't share my
  location with my abuser").

**Street addresses are intentionally NOT redacted.** The NL parser is
designed to extract them (e.g. "food near 123 Main St" needs the address
to geocode the search) — this is expected behavior, not a gap in the
redaction pass. Sending a user-typed address to OpenAI to fulfill an
address-based search is an accepted, necessary part of this feature; it is
called out here so it isn't mistaken for an oversight.

## Requirement for any client enabling this endpoint publicly

Because redaction is best-effort, any product surface (web/mobile) that
lets end users type free text must, before sending that text as
`naturalLanguageQuery`:

1. Display a notice near the search input (e.g. "Don't include personal
   details like your name, phone number, or SSN in your search — we send
   this text to a third-party AI provider to help understand your
   request").
2. Link to a privacy policy describing this data flow, consistent with
   this document, and update it if the redaction patterns or third-party
   provider change.
3. Confirm the query is not required to complete a search — a client
   should always let users fall back to structured filters
   (`searchString`, `taxonomyId`, `zipcodes`, etc) without natural
   language. Sending the user's text as `searchString` instead of
   `naturalLanguageQuery` does exactly this (see above).

Streetlives is a service used by people who are homeless or in poverty,
often in vulnerable circumstances; treat any gap between "redaction we
implemented" and "PII a user could type" as a live risk, not a hypothetical
one.
