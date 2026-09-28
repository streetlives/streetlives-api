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

Organization-provided location photos (`PUT`/`DELETE /locations/:locationId/photo`) need an S3
bucket fronted by a CDN. With these unset the endpoints answer `503` and `LocationPhoto.url` is
`null`, so the API runs normally without them:

* `LOCATION_PHOTO_S3_BUCKET` - Bucket the uploaded photos are written to. Unset disables uploads
* `LOCATION_PHOTO_PUBLIC_BASE_URL` - Public CDN origin the objects are served from, e.g. `https://photos.yourpeer.nyc`. Required alongside the bucket: storing objects nobody can read is not a useful state
* `LOCATION_PHOTO_S3_REGION` - Region of the bucket (Default: `us-east-1`)
* `LOCATION_PHOTO_KEY_PREFIX` - Key prefix for stored objects (Default: `location-photos`)
* `LOCATION_PHOTO_MAX_BYTES` - Largest accepted image, decoded (Default: 4MiB). Lambda's synchronous invoke payload limit is 6MB and base64 inflates by 4/3, so raising this much will start failing at the edge instead
* `LOCATION_PHOTO_STORAGE_DRIVER` - `s3` (inferred when a bucket is set) or `memory`, an in-process fake used by the test suite

Environment variables depends on the operating system, but can generally be set in the command-line when running the server.

For example, on Linux/Mac:

```
DATABASE_HOST=localhost DATABASE_USER=myuser DATABASE_PASSWORD=mypassword npm run dev
```

## API

See [Postman documentation](https://documenter.getpostman.com/view/3922811/RVncdbse).

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

## Running the tests

Currently, this codebase has only integration tests, testing end-to-end from HTTP request to database.

For them to work, make sure you've configured a DB as specified in the [Configuration](#configuration) section, but note that the database name used by tests will always be "test" (to separate it from any DB containing real data, as the tests wipe the data every time they run).

```
npm run test
npm run test:watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
