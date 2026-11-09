// Indexes the "last updated" lookups for a service's hours, holiday hours, languages and
// eligibility (getLatestUpdateDateForLinkedResources in src/models/metadata.js), the busiest
// metadata query in production. Without it each lookup scans every metadata row of its
// resource_table. The expression must stay identical to the query's, or Postgres can't use it.
// Partial because replacement_value is unbounded text for other fields (descriptions, etc.)
// and would exceed the btree row size limit; for service_id rows it is a uuid.
//
// Leaves metadata_holiday_service_rv_lad_desc_idx, added by hand in production, in place: the
// code still deployed while this migration runs queries replacement_value alone and uses it.
// Drop it in a later release.
//
// Built CONCURRENTLY so writes to metadata aren't blocked; that can't run in a transaction.
const INDEX = 'metadata_service_link_last_action_date';

// A failed concurrent build leaves an INVALID index that IF NOT EXISTS would silently keep.
const findInvalid = `SELECT 1 FROM pg_index
  JOIN pg_class ON pg_class.oid = pg_index.indexrelid
  WHERE pg_class.relname = '${INDEX}' AND NOT pg_index.indisvalid`;

const create = `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX}
  ON metadata (resource_table, (COALESCE(replacement_value, previous_value)), last_action_date)
  WHERE field_name = 'service_id'`;

const drop = `DROP INDEX CONCURRENTLY IF EXISTS ${INDEX}`;

export default {
  up: async (queryInterface) => {
    const [invalid] = await queryInterface.sequelize.query(findInvalid);
    if (invalid.length) {
      await queryInterface.sequelize.query(drop);
    }
    await queryInterface.sequelize.query(create);
  },

  down: queryInterface => queryInterface.sequelize.query(drop),
};
