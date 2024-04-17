jest.setTimeout(10000);

process.env.DATABASE_NAME = 'test';
process.env.DATABASE_LOGGING = 'false';

const models = require('../src/models');

const { exec } = require('child_process');

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

  await models.sequelize.sync({ force: true });

  await new Promise((resolve, reject) => {
    // run the migrations
    const migrate = exec(
      'npx sequelize-cli db:migrate --name 20240325142525-location-slugs',
      { env: process.env },
      err => (err ? reject(err) : resolve()),
    );

    // Forward stdout+stderr to this process
    migrate.stdout.pipe(process.stdout);
    migrate.stderr.pipe(process.stderr);
  });
});
afterAll(() => models.sequelize.close());
