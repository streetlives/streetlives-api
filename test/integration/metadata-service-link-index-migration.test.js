/**
 * @jest-environment node
 */

import models from '../../src/models';

const migration = require('../../sequelize/migrations/20261104120000-metadata-service-link-index');

const { sequelize, Sequelize } = models;
const queryInterface = sequelize.getQueryInterface();
const INDEX = 'metadata_service_link_last_action_date';

const indexState = async () => {
  const [row] = await sequelize.query(`SELECT pg_index.indisvalid AS valid
    FROM pg_index JOIN pg_class ON pg_class.oid = pg_index.indexrelid
    WHERE pg_class.relname = '${INDEX}'`, { type: Sequelize.QueryTypes.SELECT });
  return row ? (row.valid && 'valid') || 'invalid' : 'missing';
};

describe('metadata-service-link-index migration on Postgres', () => {
  afterAll(() => migration.default.down(queryInterface, Sequelize));

  it('creates the index, tolerates a second run, and drops it on down', async () => {
    await migration.default.up(queryInterface, Sequelize);
    expect(await indexState()).toBe('valid');

    await migration.default.up(queryInterface, Sequelize);
    expect(await indexState()).toBe('valid');

    await migration.default.down(queryInterface, Sequelize);
    expect(await indexState()).toBe('missing');
  });

  it('rebuilds an index a failed concurrent build left invalid', async () => {
    await migration.default.up(queryInterface, Sequelize);
    // What an interrupted CREATE INDEX CONCURRENTLY leaves behind.
    await sequelize.query(`UPDATE pg_index SET indisvalid = false
      WHERE indexrelid = '${INDEX}'::regclass`);
    expect(await indexState()).toBe('invalid');

    await migration.default.up(queryInterface, Sequelize);
    expect(await indexState()).toBe('valid');
  });

  // The index only helps if its expression matches the SQL the model actually sends, so plan
  // that SQL rather than a hand-written copy of it.
  it('is used by the SQL getLatestUpdateDateForLinkedResources sends', async () => {
    await migration.default.up(queryInterface, Sequelize);

    const sent = [];
    const { logging } = sequelize.options;
    sequelize.options.logging = sql => sent.push(sql.replace(/^Executing \([^)]*\): /, ''));
    try {
      await models.Metadata.getLatestUpdateDateForLinkedResources(
        'regular_schedules',
        'service_id',
        '00000000-0000-0000-0000-000000000001',
      );
    } finally {
      sequelize.options.logging = logging;
    }
    expect(sent).toHaveLength(1);

    // The test table is nearly empty, where a sequential scan always wins; rule those out so
    // the plan shows which index the query can use. SET LOCAL keeps it to this transaction.
    const plan = await sequelize.transaction(async (transaction) => {
      await sequelize.query('SET LOCAL enable_seqscan = off', { transaction });
      await sequelize.query('SET LOCAL enable_bitmapscan = off', { transaction });
      return sequelize.query(`EXPLAIN ${sent[0]}`, {
        transaction,
        type: Sequelize.QueryTypes.SELECT,
      });
    });
    const planText = plan.map(row => row['QUERY PLAN']).join('\n');
    expect(planText).toContain(INDEX);
    // Its leading resource_table column alone would also match; the lookup value has to be part
    // of the index condition, not a filter applied to every row of the table.
    expect(planText).toMatch(/Index Cond: .*COALESCE\(replacement_value, previous_value\) =/);
  });
});
