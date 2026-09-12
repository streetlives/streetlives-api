# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development server on port 3001 with hot reload (babel-node)
npm run build        # Transpile src/ → dist/ via Babel
npm start            # Build + run production server

npm run lint         # ESLint (airbnb-base, max-len 100)
npm test             # Integration tests (Jest, --runInBand, requires a running Postgres DB)
npm run test:watch   # Tests in watch mode

npm run sequelize:migration:generate -- --name <name>  # Generate new migration file
npm run sequelize:db:migrate                            # Run pending migrations
```

To run a single test file: `NODE_ENV=test npx jest --runInBand test/integration/find-locations.test.js`

### Deployment

Deploys are automated. `develop` is the integration branch; **`master` is the production branch**.

| Branch | Pipeline | What runs |
|---|---|---|
| `develop` | `.github/workflows/deploy-test-on-develop-merge.yml` | tests → migrate Stage DB → deploy test Lambda → smoke check |
| `master` | `.github/workflows/deploy-prod.yml` | tests → RDS snapshot → migrate prod DB → deploy prod Lambda → smoke check |

**Releasing to production** = opening a `develop` → `master` PR. The prod jobs run in the
`PRODUCTION` GitHub Environment, which requires reviewer approval, so merging *requests* a release
rather than silently shipping one. `deploy-prod.yml` also accepts a `workflow_dispatch` with a
`ref` and a `run_migrations` toggle — that is the break-glass path for rollbacks and for
redeploying an unchanged commit.

**Hotfixes** branch from `master` and merge back to `master`, then must be **back-merged into
`develop`** — otherwise the next `develop` → `master` PR silently reverts the fix.

**Dependency updates merge themselves.** `.github/workflows/dependency-auto-merge.yml` approves and
squash-merges Dependabot PRs into `develop` once the `test` job is green. It qualifies a PR on four
things: the update types in its `ALLOWED_UPDATES` map (patch-only for runtime dependencies, never a
major, and below 1.0.0 a minor counts as a major because `^0.34.4` will not take 0.35); a diff that
touches nothing but `package.json`/`package-lock.json`; every commit authored by the bot, committed by
GitHub's `web-flow` and signed; and the **contents** of those files — only dependency maps differ in
`package.json`, every version is a plain range rather than an `npm:` alias or a git/tarball source,
and every package the lockfile names resolves from the npm registry (over either scheme — this
lockfile still carries two legacy `http://` entries). That last gate is what makes the others more
than a statement of intent: a signature proves GitHub made the commit, not that Dependabot asked for
it. Anything else waits for a human. **Snyk PRs never auto-merge**: Snyk does not sign
its commits, and attribution alone is spoofable by anyone with push access, which matters because
`package.json` carries the scripts CI executes. The classification lives in
`.github/scripts/dependency-update-policy.js` and the privileged orchestration in
`.github/scripts/dependency-auto-merge.js`; both are covered by `test/unit/`, which injects a fake
`api` rather than calling GitHub. Requesting changes on such a PR, or labelling it
`do-not-merge`, stops the merge. Production is unaffected: it still needs the reviewed
`develop` → `master` PR.

Because a push made with `GITHUB_TOKEN` triggers no workflows, that merge does **not** fire
`deploy-test-on-develop-merge.yml` on its own — the auto-merge job dispatches it explicitly with
`require_tip=true`, which is why that workflow now accepts a `workflow_dispatch`. `require_tip`
matters: `check-revision` normally exempts dispatches from its freshness check, on the grounds that a
dispatch means "deploy this ref deliberately". An automated dispatch means the opposite — it stands
in for the push that was suppressed — so without the flag two merges landing close together could
deploy out of order and roll Stage back against newer migrations. Any future automation that pushes
to `develop` with `GITHUB_TOKEN` has the same problem and needs the same dispatch.

**Migrations must be backward-compatible with the currently-deployed code (expand/contract).**
Both pipelines migrate *before* they deploy, so the old Lambda serves traffic against the new
schema for the length of the deploy. Split a rename or a column drop across two releases: add and
backfill in one, stop reading the old column in the same release, remove the column in a later one.
Note also that `custom-analytics` queries this schema with raw SQL, so it is part of the blast
radius of any migration.

Break-glass manual deploys (no migration, no snapshot, no test gate):

```bash
npm run package-deploy:dev   # Build, zip, upload to S3, deploy to dev Lambda
npm run package-deploy:prod  # Same for production Lambda
```

These upload to `$DEPLOY_S3_KEY`, defaulting to `dist.zip` when unset, and block on
`lambda wait function-updated-v2` before returning.

**The pipelines do not use these scripts.** They run only `clean` / `build` / `package` from the
deployed tree and then deploy through `.github/actions/lambda-deploy`, which stages the artifact
under a per-run S3 key, updates the function, waits for the update to settle, and removes the
object again. The safeguards have to live in the workflow revision because the rollback path checks
out revisions that predate this pipeline: their `deploy:prod` used `--zip-file`, ignored
`DEPLOY_S3_KEY` and never waited, so a rollback would have smoke-tested the code it was replacing.
The per-run key matters because Stage and prod deploys can overlap, and a shared key lets one run
overwrite or delete the other's artifact between the upload and `update-function-code`.

Migrations reach RDS from a GitHub runner via `.github/actions/db-migrate`, which opens the
instance's security group to the runner's IP for the duration of the migration and revokes the rule
in an unconditional `always()` step. That step never exits green on a guess:

- the recorded rule id is a hint, not the only source — it also sweeps the group for rules whose
  description carries this run's id, since a rule AWS created but never acknowledged would
  otherwise stay open forever;
- an empty sweep is retried when the authorize step left no id, because
  `describe-security-group-rules` is eventually consistent and "not created" looks exactly like
  "not visible yet";
- a lookup that never completes **fails the step** rather than being read as "nothing there";
- the revoke is confirmed by looking again, and a confirmation that cannot be obtained is not a
  confirmation.

Revoking is always by rule id, never by CIDR, so it cannot clobber an unrelated rule. A failed
cleanup fails the migrate job and blocks the deploy — the right trade against leaving the database
reachable from a runner address.

Both workflows refuse a **superseded** revision, via `.github/actions/check-revision`. A concurrency
group serializes runs but does not order them, so an older push could otherwise acquire it last and
roll the environment back. The check runs twice, in two modes:

- `on-stale: report` in the `resolve` (prod) / `gate` (Stage) job, which skips the whole pipeline
  quietly when the branch has already moved on;
- `on-stale: fail` immediately before each mutation, in the migrate and deploy jobs — because
  re-running a single job reuses the earlier jobs' outputs, so the answer from the start of the run
  proves nothing by the time a schema change is about to be applied.

Only `push` is checked. Deploying an older ref deliberately is what `workflow_dispatch` is for, and
the check does not even look the branch up for one. Required secrets live in the `CI_CD_PIPELINE` (Stage)
and `PRODUCTION` environments: `{STAGE,PROD}_DATABASE_{HOST,NAME,USER,PASSWORD}`,
`{STAGE,PROD}_RDS_SECURITY_GROUP_ID`, and `PROD_RDS_INSTANCE_ID`. The `PRODUCTION` environment also
needs a `PROD_API_URL` **variable** — the prod deploy fails rather than reporting green on a deploy
nobody exercised.

The smoke check calls `$API_URL/taxonomy`, and the path matters. Traffic is served by
`StreetlivesPublicApi` (`rdxk79h7wa`, stages `Stage` and `prod`; the older `w6pkliozjh` API is denied
outright by a resource policy). Only the paths declared explicitly on that API are
`authorizationType: NONE` — `/taxonomy`, `/locations`, `/locations/{id}`, `/locations-by-slug/{slug}`,
`/location-slug-redirects/{slug}`, `/comments`, `/comment-highlights`, `/errorreports`,
`/geocode/analytics/all`. Everything else falls through to `/{proxy+}`, which is behind the Cognito
authorizer and answers an unauthenticated request with 401 before it reaches the Lambda. Set
`PROD_API_URL` to the execute-api URL for the `prod` stage, not `api.yourpeer.nyc`: the custom domain
sits behind a bot filter that answers a runner's curl with 403.

`deploy-prod.yml` deploys the tree at the resolved SHA but takes both composite actions, plus
`sequelize/config`, `src/utils` and `src/certs`, from the workflow's own revision into
`.deploy-helpers/` — the break-glass rollback path targets refs that predate this pipeline and have
none of them. The migrations applied are still the deployed ref's own.

**Every deployed database connection verifies the RDS server certificate.** `src/utils/ssl.js` is
the single implementation, used by both `src/config.js` (the app, and therefore any migration that
imports `src/models`) and `sequelize/config/database.js` (the CLI's own connection for
`SequelizeMeta` and `queryInterface`).

The trust store is **Node's public roots plus** `src/certs/rds-us-east-1-bundle.pem`. Both halves
are load-bearing: instance endpoints are signed by Amazon's private RDS CAs, which no public store
carries, while **RDS Proxy presents an ACM certificate** under a public Amazon root — and Node's
`ca` option *replaces* the default store rather than adding to it, so a bundle-only trust store
would fail against the proxy. The bundle is committed; `npm run build` copies it to `dist/certs`
(babel's `-D`), so it ships in the Lambda zip, and `__dirname` resolves the same relative path in
`src/` and in `dist/`. Refresh it, or move region, with:

```bash
curl -fsS -o src/certs/rds-us-east-1-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem
```

When TLS is required: **always** for any `*.rds.amazonaws.com` host (not negotiable — that is where
the real credentials go) and always in `production`; **never** in `test`; and in `development` it
follows the host — off for `localhost` / `127.0.0.1` / `::1`, which have no TLS to offer, on for
anything else. `DATABASE_SSL=false` opts a non-RDS development host out; `DATABASE_SSL_CA_PATH` /
`DATABASE_SSL_CA` replace the RDS bundle. There is no way to keep TLS while skipping verification.

A revision that predates all of this cannot be pinned from outside, because a model-backed
migration builds its connection from *its own* `src/config.js`. The migrate action therefore **fails
closed**: if the deployed tree has no `src/utils/ssl.js` and any of its migrations import
`src/models`, it stops and tells you to re-run with `run_migrations: false` — which is almost always
right anyway, since `db:migrate` only applies migrations the database has not seen and an older
tree has none.

The pipeline is tested rather than just read: `test/unit/deploy-pipeline.test.js` evaluates the
workflows' `if:` conditions against simulated job results (red tests, failed migration, skipped
migration, cancellation) with the expression evaluator in `test/support/github-expression.js`, and
runs the shell steps that matter — the security-group open/revoke cycle, the verified-TLS guard,
the smoke check — under `test/support/shell-step.js`, which puts stub `aws` and `curl` binaries on
the PATH and records what the script actually called.

## Architecture

**Runtime**: Express app (`src/app.js`) that runs both as a standard HTTP server (`src/index.js`) and as an AWS Lambda handler (`src/lambda.js`) via `aws-serverless-express`. Routes are defined in `src/routes.js`.

**Database**: PostgreSQL + PostGIS, accessed via Sequelize 6. Models live in `src/models/` and are auto-loaded by `src/models/index.js`. Migrations and seeders are in `sequelize/`. The Sequelize CLI config is in `sequelize/config/database.js`.

**Write pattern — always use data-changes.js**: Every create/update/delete must go through `src/services/data-changes.js` (`createInstance`, `updateInstance`, `destroyInstance`). These helpers wrap mutations in a transaction and write a `Metadata` record for every changed field, creating a full audit trail.

**Authentication**: In production, user identity comes from AWS Cognito JWT claims forwarded by API Gateway (`req.apiGateway.event.requestContext.authorizer.claims`). The `getUser` middleware (`src/middleware/get-user.js`) extracts `req.user`, `req.userOrganizationIds`, and `req.userIsAdmin`. In `development` and `test` environments, auth is bypassed entirely.

**Location search** (`src/models/location.js`): The search logic is complex — it runs many parallel queries across zip codes, phone numbers, org/location/service names (exact, prefix, full-text tsvector, levenshtein fuzzy), then deduplicates and merges results in memory. Filtering supports geo-radius (PostGIS `ST_DistanceSphere`), taxonomy, eligibility parameters, required documents, service areas, opening hours, and taxonomy-specific attributes.

**RDS Proxy session pinning avoidance**: The connection pool max is 1 (`DATABASE_POOL_MAX`). `keepDefaultTimezone: true` and `clientMinMessages: 'ignore'` prevent Sequelize from issuing session-level `SET` commands that pin connections. Location ID fetches are chunked into groups of 200 (`src/models/location.js:619`) for the same reason. Location associations and service associations are fetched as separate queries (`locationAssociations` / `serviceAssociations` in `src/controllers/locations.js`) to stay under the 16KB query size threshold.

**Comment highlights**: `src/controllers/comment-highlights.js` uses `src/controllers/openai.js` to call the OpenAI API (model `gpt-5`) with a structured output schema. Highlights are stored in the `location_comment_highlights` table. Historic comments stored as JSON objects with `whatWentWell`/`whatCouldBeImproved` keys are normalized before being sent to the LLM.

**Validation**: Request validation uses Joi schemas defined per-controller in `src/controllers/validation/`.

**Testing**: All tests are integration tests that hit a real Postgres database named `test`. `test/setup.js` drops and recreates all tables before the suite runs (`sequelize.sync({ force: true })`), then applies specific migrations needed for slug and age-filter features. There are no mocks of the database.

## Key environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 3000 | HTTP listen port |
| `DATABASE_NAME` | `streetlives` | Always `test` during tests |
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_USER` | — | |
| `DATABASE_PASSWORD` | — | |
| `DATABASE_KEEP_DEFAULT_TIMEZONE` | `true` | Set to avoid RDS Proxy pinning |
| `DATABASE_CLIENT_MIN_MESSAGES` | `ignore` | Set to avoid RDS Proxy pinning |
| `DATABASE_SSL` | host-dependent | `false` disables TLS for a non-RDS development host; ignored for RDS and in production |
| `DATABASE_SSL_CA_PATH` | `src/certs/rds-us-east-1-bundle.pem` | RDS roots added to Node's public ones |
| `DATABASE_SSL_CA` | — | The same bundle inline, if a path is inconvenient |
| `OPENAI_API_KEY` | — | Required for comment highlights |
| `SLACK_WEBHOOK_URL` | — | Optional Slack notifications |
| `ADMIN_GROUP_NAME` | `StreetlivesAdmins` | Cognito group for admin users |
