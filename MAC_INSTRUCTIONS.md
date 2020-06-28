# Easy macOS Instructions

How to get Streetlives API working on a mac:

1. Clone the repo in your desired parent directory:
```$ git clone git@github.com:streetlives/streetlives-api.git```
2. Install the dependencies:
```
$ cd streetlives-api
$ npm install
```
3. Go to https://postgresapp.com/, download and install the latest version
4. Follow these instructions to get Postgres CLI tools set up: https://postgresapp.com/documentation/cli-tools.html
5. Creating a local copy of the remote PostgreSQL data: $ pg_dump -h streetlives-stag.cd1mqmjnwg1v.us-east-1.rds.amazonaws.com -p 5432 -O -c -v -C -U devuser -d streetlives > streetlives_backup.dump
6. Open the Postgres App and initialize the database (left click on the app then click on initialize)
7. Create a local copy of the remote PostgreSQL data by running this command:
```$ pg_dump -h streetlives-stag.cd1mqmjnwg1v.us-east-1.rds.amazonaws.com -p 5432 -O -c -v -C -U devuser -d streetlives > streetlives_backup.dump```
8. Run this command to upload this dump into your local database server:
```$ sudo -u postgres psql < streetlives_backup.dump https://stackoverflow.com/questions/6842393/import-sql-dump-into-postgresql-database```
if this command doesn't work, you may need to replace `postgres` with your personal username (by default, this matches your mac username. In my case, `adamnguyen`)
9. Run ```env DATABASE_HOST=localhost DATABASE_USER=postgres DATABASE_PASSWORD=mypassword npm run dev``` inside your `streetlives-api` directory to boot your server.