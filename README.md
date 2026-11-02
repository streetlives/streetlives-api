# Streetlives API

Streetlives is a community-built platform for enabling people who are homeless or in poverty to easily find, rate and recommend social services across New York City.

This repository contains the Streetlives back-end server, which provides an API for accessing and interacting with the Streetlives data.

## Getting Started

### Prerequisites

For the Streetlives server to run, it requires a connection to a PostgreSQL database.

You can install and run the database locally (instructions [here](https://wiki.postgresql.org/wiki/Detailed_installation_guides)), or connect to a remote database (for instance on [RDS](https://aws.amazon.com/rds/)).

See the [Configuration](#configuration) section for how to configure the database connection info.

Since Streetlives relies heavily on geographical data, it requires enabling PostGIS (version < 2.2.0) on the database. After [installing](https://postgis.net/install) the PostGIS software locally, connect to the correct database within PostgreSQL (Default: 'streetlives') using [psql](https://www.postgresql.org/docs/current/static/app-psql.html) (or another PostgreSQL management tool) and run:

```
CREATE EXTENSION postgis;
```

### Installing

1. Clone the repo:

```
git clone git@github.com:streetlives/streetlives-api.git
```

2. Install the dependencies:

```
cd streetlives-api
npm install
```

3. Set the [configuration](#configuration) variables as needed.

4. Run the development server:

```
npm run dev
```

5. To build and run a distribution build of the server:

```
npm start
```

### Configuration

All configuration options can be passed to the server using environment variables. The following variables are supported:

* `PORT` - The port on which the server will listen to requests (Default: 3000)
* `DATABASE_NAME` - The name of the database used to store Streetlives data (Default: "streetlives")
* `DATABASE_HOST` - The URL at which the database is hosted
* `DATABASE_USER` - The username used to connect to the database
* `DATABASE_PASSWORD` - The password used to connect to the database
* `DATABASE_CLIENT_MIN_MESSAGES` - Postgres `client_min_messages` level. Keep as `ignore` with RDS Proxy to avoid connection pinning from session-level `SET` commands (Default: `ignore`)
* `DATABASE_KEEP_DEFAULT_TIMEZONE` - When `true`, sequelize will not issue `SET TIME ZONE ...` per connection, which avoids RDS Proxy session pinning (Default: `true`)
* `CHANGE_FEED_ALLOWED_CLIENT_IDS` - Comma-separated Cognito app client ids allowed to read the [change feed](#change-feed--what-changed-and-who-changed-it). Unset allows nobody
* `CHANGE_FEED_SETTLE_SECONDS` - How many of the newest seconds the change feed holds back for transactions still committing (Default: 120)

Organization-provided location photos (`PUT`/`DELETE /locations/:locationId/photo`) need an S3
bucket fronted by a CDN. With these unset the endpoints answer `503` and `LocationPhoto.url` is
`null`, so the API runs normally without them:

* `LOCATION_PHOTO_S3_BUCKET` - Bucket the uploaded photos are written to. Unset disables uploads
* `LOCATION_PHOTO_PUBLIC_BASE_URL` - Public CDN origin the objects are served from, e.g. `https://photos.yourpeer.nyc`. Required alongside the bucket: storing objects nobody can read is not a useful state
* `LOCATION_PHOTO_S3_REGION` - Region of the bucket (Default: `us-east-1`)
* `LOCATION_PHOTO_KEY_PREFIX` - Key prefix for stored objects (Default: `location-photos`)
* `LOCATION_PHOTO_MAX_BYTES` - Largest accepted image, decoded (Default and maximum: 4MiB). **Lowers the limit only.** A larger value is rejected by request validation before the controller sees it, and could not work anyway: Lambda's synchronous invoke payload limit is 6MB, base64 inflates by 4/3, and the request would fail at the edge
* `LOCATION_PHOTO_STORAGE_DRIVER` - `s3` (inferred when a bucket is set) or `memory`, an in-process fake used by the test suite

Environment variables depends on the operating system, but can generally be set in the command-line when running the server.

For example, on Linux/Mac:

```
DATABASE_HOST=localhost DATABASE_USER=myuser DATABASE_PASSWORD=mypassword npm run dev
```

## API

See [Postman documentation](https://documenter.getpostman.com/view/3922811/RVncdbse).

### Schedule times are New York time

`HolidaySchedules` rows carry the HSDS 3.0 `schedule` fields `freq`, `interval`,
`byday`, `bymonthday`, `valid_from`, `valid_to` and `description`. They leave out
the optional `timezone`: HSDS defines it as a fixed UTC offset, which can't
follow daylight saving time. Every `opens_at`/`closes_at` and date is instead
New York local time (`America/New_York`), and the `openAt` search evaluates
schedules on the New York date.

### Schedules are series

`HolidaySchedules` rows work like Google Calendar events:

- **An open row with `freq` is a series.** It occurs on the days `byday` or
  `bymonthday` name (`SA`, `1SA,3SA`, `-1FR`, `15`), in the months `bymonth`
  names (`6,7,8` for summer only), every `interval` weeks, months or years counted
  from `valid_from`, from `valid_from` (its first occurrence) until `valid_to`,
  except on the dates in `exdates`. Setting `valid_to` stops it; adding a date to
  `exdates` deletes that one occurrence; "new hours from December 1" ends one row
  on November 30 and starts another on December 1.
- **A closed row with `freq` is a closure that repeats**, so holidays don't need
  entering every year: `YEARLY` with `bymonth` and `bymonthday` ("every December
  25") or a numbered `byday` ("4TH" in November: Thanksgiving), or every day of the
  month ("all of August"); `MONTHLY` ("the last Friday of every month"). Its
  `exdates` skip a year.
- **A row without `freq` but with `valid_from` is a one-off** for
  `valid_from`..`valid_to` ("special hours"), closed or with its own hours.
- **A date's hours** come from its one-offs, else nothing if a repeating closure
  falls on it, else its series. So "open 10 AM–2 PM this Christmas" beats "closed
  every Christmas".
- **Each occurrence belongs to the day it starts on** and runs into the next day
  when `closes_at` <= `opens_at`, so a Saturday closure doesn't cut Friday
  night's 10 PM–2 AM short.

`PATCH /services/:id` refuses `irregularHours` whose time ranges overlap or touch
on some date in the coming year (9 AM–1 PM with 1–5 PM should be one range),
counting overnight hours, or that make a date both closed and open
(`src/services/schedule-conflicts.js`).

`exdates` and `bymonth` are extensions: HSDS has no way to skip one occurrence
and no `bymonth`. Rows saved before `freq` existed (an open row with only a
`weekday`) are weekly series; the model and migration fill in `freq`/`byday` for
them. An open row with a `weekday` and dates but no `freq` is left as it is, and
readers take it as that weekday every week between the dates, as they did before. The location responses leave out rows whose `valid_to` has passed, and
gogetta drops them (and past `exdates`) the next time the hours are saved.

The `openAt` search (`src/utils/schedule-sql.js`), the clash check
(`src/utils/schedule-rules.js`), gogetta's editor and yourpeer.nyc all apply
these rules, and all are tested against `test/fixtures/schedule-cases.json`.
Change the copies of that file and of `schedule-rules.js` together.

### `LocationPhoto` — an extension beyond HSDS

This schema is derived from the [Human Services Data
Specification](https://docs.openreferral.org/en/latest/hsds/) (HSDS). HSDS has no
concept of a photo attached to a location: its only image field anywhere is
`organization.logo`, a bare URL on the organization, and the `url` object added
in HSDS 3.0 attaches to organizations and services rather than locations and is
meant for links, not media.

`LocationPhoto` is therefore an **extension**. HSDS permits this — a publication
stays conformant when it carries properties not defined in the specification, as
long as no suitable HSDS property already exists and the addition is documented
([Extending HSDS](https://docs.openreferral.org/en/latest/hsds/extending.html)).
This section is that documentation.

It appears on `GET /locations/:id` and `GET /locations-by-slug/:slug`, and is
`null` when a location has no photo:

```jsonc
"LocationPhoto": {
  "id": "…",
  "url": "https://photos.yourpeer.nyc/location-photos/<location>/<sha256>.jpg",
  "content_type": "image/jpeg",
  "byte_size": 184233,
  "width": 1600,
  "height": 1200,
  "original_filename": "front-door.jpg",
  "createdAt": "…",
  "updatedAt": "…"
}
```

`url` is the only field a consumer needs, and it is the only portable one. The
bucket, object key and content digest are stored but never published, so
consumers are not coupled to how this deployment happens to store the file. If
these records are ever exported as HSDS, `url` is the field to map; the closest
thing in the specification is `organization.logo`, which is also just a URL.

Provenance is not on the object. Who uploaded a photo and when comes from the
`metadata` table like every other change in this schema, and surfaces on the
location's `metadata.location` array as a `photo` entry.

The `naturalLanguageQuery` param on `GET /locations` sends (redacted) user
text to the OpenAI API. Populating the param is itself the consent signal:
clients must only send it after showing the user the third-party-AI notice —
see [PRIVACY.md](PRIVACY.md) for the data flow, redaction
coverage/limitations, and requirements for any client enabling this feature
publicly.

A street address extracted from the query ("food near 123 Main St") is a
*proximity* input: it is resolved against the directory's own stored
addresses and, when it matches one, anchors a radius search around that
point (composing with any explicit `latitude`/`longitude` filter). There is
no external geocoding service, so an address the directory doesn't know
falls back to a keyword search rather than filtering results by address
string. Explicit query params always win over their extracted counterparts
(`searchString`, `taxonomyId`, `zipcodes`, `gender`, `membership`, age
params, `openAt`).

### Change feed — what changed, and who changed it

Two read-only endpoints let a cache that mirrors this directory stay current
without re-reading every location. Neither is part of HSDS, and both are for
machine clients only. They answer `401` unless an API Gateway authorizer
verified the request's Cognito access token. That is either a Cognito user pool
authorizer (the token's `client_id` claim) or the internal API's
`InternalApiAuthorizer` Lambda (its `clientId` context). They answer `403`
unless that app client is listed in `CHANGE_FEED_ALLOWED_CLIENT_IDS` (unset
allows nobody). On the public API they live at the top level rather than under
`/locations/{id}`, because that path is served without an authorizer there.

Both take `since` (an ISO timestamp, inclusive) or `cursor` (the `nextCursor`
of a previous page), plus an optional `limit`. Keep requesting with
`nextCursor` while `hasMore` is true; store the last `nextCursor` and resume
from it next time — an empty page hands back the position it was given.

A cursor never moves past a row whose transaction hasn't committed yet. Both
feeds stop short of the start of the oldest open transaction that has written
anything, however long it runs, and also hold back the newest
`CHANGE_FEED_SETTLE_SECONDS` (default 120) against clock skew. Open
transactions are read from `pg_stat_activity`, which shows other roles'
sessions only to a member of `pg_read_all_stats`. Grant that to the API's
database role if anything else writes these tables under a different role.

`GET /location-changes` (`limit` up to 1000, default 500) lists the locations
whose `GET /locations/:id` response may have changed, oldest first:

```jsonc
{
  "changes": [
    { "location_id": "…", "changed_at": "2026-11-01T14:03:12.481Z", "deleted": false }
  ],
  "nextCursor": "…",
  "hasMore": false,
  "serverTime": "…"
}
```

A location appears once, at its latest change. It is recorded by triggers on
every table its detail is built from, so it includes bulk deletes and SQL run
outside the API, which write no metadata; a holiday schedule passing its
`valid_to` counts as a change too, because the row then drops out of the
detail. `deleted: true` means the location no longer exists. Changes to the
shared lookup tables (taxonomies, languages, eligibility parameters) are not
reported per location.

`GET /location-edits` (`limit` up to 250, default 100) pages through the
`metadata` audit log in the order it was written, each row resolved to the
locations (and service) it belongs to — including rows whose resource has since
been deleted:

```jsonc
{
  "edits": [
    {
      "id": "…",
      "resource_table": "phones",
      "resource_id": "…",
      "field_name": "number",
      "last_action_type": "update",
      "last_action_date": "…",
      "created_at": "…",
      "updated_by": "…",
      "source": null,
      "previous_value": "212-555-0100",
      "replacement_value": "212-555-0199",
      "location_ids": ["…"],
      "service_id": null
    }
  ],
  "nextCursor": "…",
  "hasMore": false,
  "serverTime": "…"
}
```

Paging is by when the row was written (`created_at`), not `last_action_date`,
which an admin may backdate.

## Running the tests

Currently, this codebase has only integration tests, testing end-to-end from HTTP request to database.

For them to work, make sure you've configured a DB as specified in the [Configuration](#configuration) section, but note that the database name used by tests will always be "test" (to separate it from any DB containing real data, as the tests wipe the data every time they run).

```
npm run test
npm run test:watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
