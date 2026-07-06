const util = require('util');
const exec = util.promisify(require('child_process').exec);

jest.setTimeout(10000);

require('./env');

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
  // reset the database state
  await models.sequelize.query(`
    DO $$
    DECLARE _table record;
    BEGIN
      FOR _table IN 
        SELECT table_name FROM information_schema.tables t
        inner join pg_catalog.pg_tables p on 
        p.tablename = t.table_name and p.schemaname = t.table_schema
        where table_schema = 'public' and 
          table_type='BASE TABLE' and p.tableowner = 'streetlives'
      LOOP
        EXECUTE format('drop table %I cascade',_table.table_name);
      END LOOP;
    END$$;
  `);
  // for (let [table] of tables){
  //  await models.sequelize.query(`drop table ${table} cascade`);
  // }

  await models.sequelize.query('DROP TYPE IF EXISTS age_eligibility CASCADE');

  await models.sequelize.query('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch');

  await models.sequelize.sync({ force: true });

  // `sequelize.sync()` creates services.description_vector as a plain,
  // never-populated TSVECTOR column; in production it is a generated column
  // (migration 20240516032309-full_text_search), so full-text search on
  // descriptions finds nothing in tests. A generated column can't be used
  // here because Sequelize's bulkCreate writes every model attribute and
  // Postgres rejects explicit values for GENERATED ALWAYS columns, so
  // populate it with a trigger instead — identical read behavior. Name
  // vectors are intentionally left null: those searches are query-time and
  // get-taxonomy.test.js asserts name_vector stays null.
  await models.sequelize.query(`
    CREATE OR REPLACE FUNCTION test_set_service_description_vector() RETURNS trigger AS $$
    BEGIN
      NEW.description_vector := to_tsvector('english', NEW.description);
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS services_set_description_vector ON services;
    CREATE TRIGGER services_set_description_vector BEFORE INSERT OR UPDATE ON services
      FOR EACH ROW EXECUTE FUNCTION test_set_service_description_vector();
  `);

  // eslint-disable-next-line no-implied-eval
  await execScript('npx sequelize-cli db:migrate --name 20240325142525-location-slugs');
  // eslint-disable-next-line no-implied-eval
  await execScript('npx sequelize-cli db:migrate --name 20240607172205-age-filter');
});
afterAll(async () => {
  await models.sequelize.close();
});
