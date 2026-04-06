require('dotenv').config({ path: '.env.local' });
require('openai/shims/node');

const util = require('util');
const exec = util.promisify(require('child_process').exec);

jest.setTimeout(30000);

process.env.DATABASE_NAME = 'test';
process.env.DATABASE_LOGGING = 'false';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'streetlives';
process.env.DATABASE_PASSWORD = 'password';
process.env.OPENAI_API_KEY = 'fake';

const models = require('../src/models');

async function execScript(script) {
  // run the migrations
  const promise = exec(
    script,
    { env: process.env },
  );

  const { child } = promise;

  // Forward stdout+stderr to this process
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  await promise;
}

beforeAll(async () => {
  // reset the database state, including any leftover custom types or objects
  await models.sequelize.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  `);

  await models.sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  await models.sequelize.query('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;');
  await models.sequelize.sync({ force: true });

  // eslint-disable-next-line no-implied-eval
  await execScript('npx sequelize-cli db:migrate --name 20240325142525-location-slugs');
  // eslint-disable-next-line no-implied-eval
  await execScript('npx sequelize-cli db:migrate --name 20240607172205-age-filter');
});
afterAll(async () => {
  // eslint-disable-next-line no-implied-eval
  await execScript('npx sequelize-cli db:migrate:undo --name 20240607172205-age-filter');
  await models.sequelize.close();
});
