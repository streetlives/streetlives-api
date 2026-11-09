// GET /location-changes and /location-edits page through metadata by (created_at, id). Without
// this index every page is a full scan and sort of the audit log. CONCURRENTLY keeps writes
// flowing while it builds, which is also why this migration is separate: it can't run inside a
// transaction.
const INDEX = 'metadata_created_at_id';

export default {
  up: async (queryInterface) => {
    // A failed concurrent build leaves an INVALID index that IF NOT EXISTS would then keep.
    await queryInterface.sequelize.query(`DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
          WHERE c.relname = '${INDEX}' AND NOT i.indisvalid
        ) THEN
          EXECUTE 'DROP INDEX ${INDEX}';
        END IF;
      END $$`);
    await queryInterface.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX}
      ON metadata (created_at, id)`);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX}`);
  },
};
