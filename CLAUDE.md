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
instance's security group to the runner's IP for the duration of the migration and revokes the
rule in an `always()` step. Required secrets live in the `CI_CD_PIPELINE` (Stage) and `PRODUCTION`
environments: `{STAGE,PROD}_DATABASE_{HOST,NAME,USER,PASSWORD}`,
`{STAGE,PROD}_RDS_SECURITY_GROUP_ID`, and `PROD_RDS_INSTANCE_ID`.

`deploy-prod.yml` deploys the tree at the resolved SHA but takes both composite actions, plus
`sequelize/config`, `src/utils` and `src/certs`, from the workflow's own revision into
`.deploy-helpers/` — the break-glass rollback path targets refs that predate this pipeline and have
none of them. The migrations applied are still the deployed ref's own.

**Every database connection verifies the RDS server certificate.** `src/utils/ssl.js` is the single
implementation, used by both `src/config.js` (the app, and therefore any migration that imports
`src/models`) and `sequelize/config/database.js` (the CLI's own connection for `SequelizeMeta` and
`queryInterface`). It sets `rejectUnauthorized: true` against `src/certs/rds-us-east-1-bundle.pem`,
which is committed because AWS signs RDS endpoints with private CAs that are not in Node's trust
store. `npm run build` copies it to `dist/certs` (babel's `-D`), so it ships in the Lambda zip;
`__dirname` resolves the same relative path in `src/` and in `dist/`.

There is no skip-verification fallback — a missing bundle throws with fetch instructions. Refresh
it, or move region, with:

```bash
curl -fsS -o src/certs/rds-us-east-1-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem
```

`DATABASE_SSL_CA_PATH` / `DATABASE_SSL_CA` override it. One residual gap: rolling back to a revision
that predates this change and migrating at the same time runs *that* revision's `src/config.js` for
any model-backed migration, which cannot be pinned from outside — the migrate action emits a
warning for exactly that case, and `run_migrations: false` is the right answer when rolling back
that far.

The gates themselves are tested: `test/unit/deploy-pipeline.test.js` evaluates the workflows'
`if:` conditions against simulated job results (red tests, failed migration, skipped migration,
cancellation) using the small expression evaluator in `test/support/github-expression.js`.

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
| `DATABASE_SSL_CA_PATH` | `src/certs/rds-us-east-1-bundle.pem` | RDS trust store; overrides the bundle shipped with the code |
| `DATABASE_SSL_CA` | — | The same bundle inline, if a path is inconvenient |
| `OPENAI_API_KEY` | — | Required for comment highlights |
| `SLACK_WEBHOOK_URL` | — | Optional Slack notifications |
| `ADMIN_GROUP_NAME` | `StreetlivesAdmins` | Cognito group for admin users |
