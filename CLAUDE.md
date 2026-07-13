# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Streetlives API — Express backend (PostgreSQL/PostGIS via Sequelize) for finding social services across NYC. Deployed as an AWS Lambda behind API Gateway via aws-serverless-express; also runs as a plain Node server locally. Source is ES-module syntax transpiled with Babel from `src/` to `dist/`.

## Commands

```bash
npm run dev                # dev server on port 3001 (nodemon + babel-node)
npm run lint               # eslint (airbnb-base)
npm test                   # all tests: unit + integration jest projects, --runInBand --coverage
NODE_ENV=test npx jest --runInBand test/integration/find-locations.test.js   # single test file
npx jest --config jest.unit.config.js                                        # unit tests only
npm run sequelize:db:migrate                 # run migrations (config in sequelize/config/database.js, per .sequelizerc)
npm run sequelize:migration:generate -- <name>
npm run package-deploy:dev|prod              # build, zip with node_modules, upload to Lambda
```

`pre-commit` runs `lint` and `test` on every commit.

Database connection is configured via env vars (`DATABASE_NAME`, `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PASSWORD`, ...) — see README.md and `src/config.js`. SSL is required except when `NODE_ENV=test`.

## Testing setup (important)

- Jest is configured with two projects in package.json: `unit` (`test/unit/`) and `integration` (`test/integration/`). Jest is v24: `--selectProjects` does not exist; use paths or `jest.unit.config.js`.
- Both projects map `openai` to `test/__mocks__/openai-stub.js` and `node:stream` to a shim (Jest 24 can't resolve `node:` specifiers used by the AWS SDK). Jest 24 does **not** inherit the root `moduleNameMapper` into `projects[]`, so the mappers are duplicated into each project — keep them in sync.
- `test/env.js` supplies default DB env vars (DB name `test`, user `streetlives`) and a placeholder `OPENAI_API_KEY`.
- Integration tests hit a real Postgres DB named `test` end-to-end and **wipe it** in `test/setup.js` `beforeAll`: it drops tables owned by role `streetlives`, runs `sequelize.sync({ force: true })`, then applies only two specific migrations (location-slugs, age-filter). The schema therefore comes from the models, not the migration history; `services.description_vector` (a generated column in production, migration `20240516032309`) is emulated with a trigger in tests.
- The `test` DB needs extensions pre-provisioned: `postgis`, `fuzzystrmatch` (location search uses `levenshtein()`), `uuid-ossp`, `pgcrypto`. Locally, if tables end up owned by a role other than `streetlives`, the reset drops nothing and a second integration file fails on "Migration is not pending" — reset with `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` plus the extensions between runs.

## Architecture

Request flow: `src/routes.js` (all routes + central error handler) → `src/controllers/` (HTTP handling, Joi validation in `src/controllers/validation/`) → `src/services/` (cross-cutting business logic) → `src/models/` (Sequelize).

- **Entry points**: `src/index.js` (local server, runs `sequelize.sync()` on boot), `src/lambda.js` (Lambda handler). `src/app.js` wires middleware.
- **Errors**: throw the classes in `src/utils/errors.js` (`NotFoundError`, `AuthError`, `ForbiddenError`, `ValidationError`); the error middleware in `routes.js` maps them to 404/401/403/400. Anything else becomes a 500.
- **Auth**: no auth library. `middleware/get-user.js` reads Cognito claims injected by API Gateway (`req.apiGateway.event.requestContext.authorizer.claims`) to set `req.user`, `req.userOrganizationIds`, `req.userIsAdmin` (Cognito group from `ADMIN_GROUP_NAME`). In `development`/`test` both `get-user` and `data-entry-auth` are bypassed with an anonymous user.
- **Models**: HSDS-style schema — Organization → Location → Service, joined by ServiceAtLocation, plus schedules, addresses, phones, comments, taxonomy. `src/models/index.js` auto-loads every file in the directory and calls `associate`. Models use `underscored` naming. `Location` has a `beforeFind` hook that silently filters out `hidden_from_search` rows unless querying by id — remember this when a location "doesn't exist".
- **Audit trail**: all data-entry writes go through `src/services/data-changes.js`, which wraps create/update in a transaction and records per-field before/after values into the `metadata` table. Don't call `Model.create/update` directly for user-editable data.
- **Search**: `GET /locations` in `controllers/locations.js` is the core endpoint — PostGIS radius/geometry filters, full-text (`tsvector`) and fuzzy (`levenshtein`) matching in `models/location.js`, occasion/closure-aware sorting in `controllers/sort-by.js`.
- **OpenAI integration**: `src/controllers/openai.js` (large file) handles both comment-highlight generation and natural-language search query parsing (`parseNaturalLanguageQuery`, used by `locations.find`). The NL path is guarded by an in-memory per-instance cache/concurrency cap plus a timeout, and — because Lambda runs many instances — a **cross-instance** fixed-window rate limit and circuit breaker backed by Postgres in `src/controllers/nl-limiter.js` (single-row `openai_rate_limit_state` table, atomic UPSERTs, fails open on DB error). On any failure or tripped guard it degrades to using the raw query as a plain search string.
- **Migrations vs models**: migrations in `sequelize/migrations/` are the production schema history, but tests build schema from models — when changing schema, update both the model and a migration.
