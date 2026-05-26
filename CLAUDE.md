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

```bash
npm run package-deploy:dev   # Build, zip, upload to S3, deploy to dev Lambda
npm run package-deploy:prod  # Same for production Lambda
```

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
| `OPENAI_API_KEY` | — | Required for comment highlights |
| `SLACK_WEBHOOK_URL` | — | Optional Slack notifications |
| `ADMIN_GROUP_NAME` | `StreetlivesAdmins` | Cognito group for admin users |
