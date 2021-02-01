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

[Easy macOS Installation Instructions](MAC_INSTRUCTIONS.md)

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

Environment variables depends on the operating system, but can generally be set in the command-line when running the server.

For example, on Linux/Mac:

```
DATABASE_HOST=localhost DATABASE_USER=myuser DATABASE_PASSWORD=mypassword npm run dev
```

## API

See [Postman documentation](https://documenter.getpostman.com/view/3922811/RVncdbse).

## Running the tests

Currently, this codebase has only integration tests, testing end-to-end from HTTP request to database.

For them to work, make sure you've configured a DB as specified in the [Configuration](#configuration) section, but note that the database name used by tests will always be "test" (to separate it from any DB containing real data, as the tests wipe the data every time they run).

```
npm run test
npm run test:watch
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
