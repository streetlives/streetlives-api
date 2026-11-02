// Records, per location, when anything its GET /locations/:id response is built from last
// changed, so GET /location-changes can answer "what changed since T" from one index range scan
// instead of clients re-reading every location (see the README's "Change feed" section).
//
// Statement-level triggers (one set-based upsert per statement, however many rows it touched)
// cover inserts, updates and deletes - including bulk destroy() calls and SQL run outside the
// API, which write no metadata. A metadata insert counts too: re-confirming an unchanged field
// writes only a metadata row, and that still moves the field's last-updated date on the
// location. Deleted rows keep their location in location_change_deleted_resources so the
// metadata row recording a delete can still be attributed to a location afterwards.
const CHANGES = 'location_changes';
const DELETED = 'location_change_deleted_resources';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// How a row of each table leads to the locations whose detail includes it.
const TRACKED_TABLES = {
  locations: { links: ['self_location'] },
  organizations: { links: ['self_organization'] },
  services: { links: ['self_service'] },
  service_at_locations: { links: ['location_id'], serviceColumn: 'service_id' },
  physical_addresses: { links: ['location_id'] },
  accessibility_for_disabilities: { links: ['location_id'] },
  streetviews: { links: ['location_id'] },
  location_photos: { links: ['location_id'] },
  phones: {
    links: ['location_id', 'service_id', 'service_at_location_id', 'organization_id'],
    serviceColumn: 'service_id',
  },
  event_related_info: { links: ['location_id', 'service_id'], serviceColumn: 'service_id' },
  regular_schedules: {
    links: ['location_id', 'service_id', 'service_at_location_id'],
    serviceColumn: 'service_id',
  },
  holiday_schedules: {
    links: ['location_id', 'service_id', 'service_at_location_id'],
    serviceColumn: 'service_id',
  },
  service_areas: { links: ['service_id'], serviceColumn: 'service_id' },
  eligibility: { links: ['service_id'], serviceColumn: 'service_id' },
  service_taxonomy_specific_attributes: { links: ['service_id'], serviceColumn: 'service_id' },
  service_taxonomy: { links: ['service_id'], serviceColumn: 'service_id' },
  service_languages: { links: ['service_id'], serviceColumn: 'service_id' },
  required_documents: { links: ['service_id'], serviceColumn: 'service_id' },
  documents_infos: { links: ['service_id'], serviceColumn: 'service_id' },
};

// Attributable to a location for GET /location-edits, but not part of its detail response.
const ATTRIBUTION_ONLY_TABLES = {
  comments: { links: ['location_id', 'service_at_location_id'] },
};

const RESOLVABLE_TABLES = { ...TRACKED_TABLES, ...ATTRIBUTION_ONLY_TABLES };

const requiredColumns = ({ links, serviceColumn }) => [...new Set([
  'id',
  ...links.filter(link => !link.startsWith('self_')),
  ...(serviceColumn ? [serviceColumn] : []),
])];

// Selects (resource_id, location_id, service_id) for the rows in `rows`. `afterDelete` also
// finds the locations of a service whose service_at_locations rows went in the same delete.
const resolverSql = ({ links, serviceColumn }, rows, { afterDelete = false } = {}) => links
  .map((link) => {
    switch (link) {
      case 'self_location':
        return `SELECT r.id AS resource_id, r.id AS location_id, NULL::uuid AS service_id
          FROM ${rows} r`;
      case 'self_organization':
        return `SELECT r.id AS resource_id, l.id AS location_id, NULL::uuid AS service_id
          FROM ${rows} r JOIN locations l ON l.organization_id = r.id`;
      case 'self_service':
        return [`SELECT r.id AS resource_id, sal.location_id AS location_id,
            r.id AS service_id
          FROM ${rows} r LEFT JOIN service_at_locations sal ON sal.service_id = r.id`]
          .concat(afterDelete ? [`SELECT r.id, d.location_id, r.id
          FROM ${rows} r JOIN ${DELETED} d
            ON d.resource_table = 'service_at_locations' AND d.service_id = r.id`] : [])
          .join('\n UNION ALL ');
      case 'location_id':
        return `SELECT r.id AS resource_id, r.location_id AS location_id,
            ${serviceColumn ? `r.${serviceColumn}` : 'NULL::uuid'} AS service_id
          FROM ${rows} r WHERE r.location_id IS NOT NULL`;
      case 'service_id':
        return `SELECT r.id AS resource_id, sal.location_id AS location_id,
            r.service_id AS service_id
          FROM ${rows} r LEFT JOIN service_at_locations sal ON sal.service_id = r.service_id
          WHERE r.service_id IS NOT NULL`;
      case 'service_at_location_id':
        return `SELECT r.id AS resource_id, sal.location_id AS location_id,
            sal.service_id AS service_id
          FROM ${rows} r JOIN service_at_locations sal ON sal.id = r.service_at_location_id`;
      case 'organization_id':
        return `SELECT r.id AS resource_id, l.id AS location_id, NULL::uuid AS service_id
          FROM ${rows} r JOIN locations l ON l.organization_id = r.organization_id`;
      default:
        throw new Error(`Unknown location link ${link}`);
    }
  })
  .join('\n UNION ALL ');

const trackFunction = table => `location_changes_track_${table}`;
const triggerName = (table, event) => `location_changes_${table}_${event}`;
const TRIGGER_EVENTS = [
  { event: 'insert', sql: 'INSERT', referencing: 'NEW TABLE AS new_rows' },
  { event: 'update', sql: 'UPDATE', referencing: 'OLD TABLE AS old_rows NEW TABLE AS new_rows' },
  { event: 'delete', sql: 'DELETE', referencing: 'OLD TABLE AS old_rows' },
];

const createTrackFunctionSql = (table, spec) => `
  CREATE OR REPLACE FUNCTION ${trackFunction(table)}() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP <> 'DELETE' THEN
      PERFORM location_changes_record(ARRAY(
        SELECT x.location_id FROM (${resolverSql(spec, 'new_rows')}) x));
    END IF;
    IF TG_OP = 'UPDATE' THEN
      PERFORM location_changes_record(ARRAY(
        SELECT x.location_id FROM (${resolverSql(spec, 'old_rows')}) x));
    END IF;
    IF TG_OP = 'DELETE' THEN
      INSERT INTO ${DELETED} (resource_table, resource_id, location_id, service_id)
      SELECT DISTINCT TG_TABLE_NAME, x.resource_id, x.location_id, x.service_id
      FROM (${resolverSql(spec, 'old_rows', { afterDelete: true })}) x
      WHERE x.location_id IS NOT NULL OR x.service_id IS NOT NULL;
      PERFORM location_changes_record(ARRAY(
        SELECT x.location_id FROM (${resolverSql(spec, 'old_rows', { afterDelete: true })}) x));
      -- A delete's attribution is read within minutes; keep the map from growing forever.
      DELETE FROM ${DELETED} WHERE deleted_at < clock_timestamp() - interval '180 days';
    END IF;
    RETURN NULL;
  END
  $$;
`;

const resolveBranchesSql = () => Object.entries(RESOLVABLE_TABLES)
  .map(([table, spec], index) => `
    ${index === 0 ? 'IF' : 'ELSIF'} _resource_table = '${table}' THEN
      RETURN QUERY SELECT x.location_id, x.service_id FROM (${resolverSql(
    spec,
    `(SELECT * FROM ${table} WHERE id = _resource_id)`,
  )}) x;`)
  .join('');

const createSharedFunctionsSql = () => `
  CREATE OR REPLACE FUNCTION location_changes_record(location_ids uuid[]) RETURNS void
  LANGUAGE sql AS $$
    -- Sorted, so concurrent writers touching the same locations lock them in the same order.
    INSERT INTO ${CHANGES} (location_id, changed_at)
    SELECT ids.id, clock_timestamp()
    FROM (SELECT DISTINCT unnest(location_ids) AS id) ids
    WHERE ids.id IS NOT NULL
    ORDER BY ids.id
    ON CONFLICT (location_id) DO UPDATE SET changed_at = EXCLUDED.changed_at
  $$;

  -- The locations (and service) a metadata row's resource belongs to. Falls back to the map
  -- of deleted rows once the resource itself is gone.
  CREATE OR REPLACE FUNCTION location_changes_resolve(_resource_table text, _resource_id uuid)
  RETURNS TABLE (location_id uuid, service_id uuid)
  LANGUAGE plpgsql STABLE AS $$
  #variable_conflict use_column
  BEGIN
    ${resolveBranchesSql()}
    END IF;
    IF NOT FOUND THEN
      RETURN QUERY SELECT d.location_id, d.service_id FROM ${DELETED} d
        WHERE d.resource_table = _resource_table AND d.resource_id = _resource_id;
      -- A cascade deletes service_at_locations after the services delete has been mapped,
      -- so a deleted service finds its locations among the links deleted alongside it.
      IF _resource_table = 'services' THEN
        RETURN QUERY SELECT link.location_id, link.service_id
        FROM ${DELETED} service
        JOIN ${DELETED} link ON link.resource_table = 'service_at_locations'
          AND link.service_id = service.resource_id
          AND link.deleted_at BETWEEN service.deleted_at - interval '1 minute'
            AND service.deleted_at + interval '1 minute'
        WHERE service.resource_table = 'services' AND service.resource_id = _resource_id;
      END IF;
    END IF;
  END
  $$;

  CREATE OR REPLACE FUNCTION location_changes_track_metadata() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    PERFORM location_changes_record(ARRAY(
      SELECT r.location_id
      FROM new_rows m
      CROSS JOIN LATERAL location_changes_resolve(m.resource_table, m.resource_id) r
      WHERE m.resource_table <> ALL (ARRAY[${Object.keys(ATTRIBUTION_ONLY_TABLES)
    .map(table => `'${table}'`).join(', ')}])));
    RETURN NULL;
  END
  $$;
`;

const dropTriggersSql = table => TRIGGER_EVENTS
  .map(({ event }) => `DROP TRIGGER IF EXISTS ${triggerName(table, event)} ON ${table};`)
  .join('\n');

const createTriggersSql = table => TRIGGER_EVENTS
  .map(({ event, sql, referencing }) => `
    CREATE TRIGGER ${triggerName(table, event)} AFTER ${sql} ON ${table}
      REFERENCING ${referencing}
      FOR EACH STATEMENT EXECUTE PROCEDURE ${trackFunction(table)}();`)
  .join('\n');

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      const select = sql => queryInterface.sequelize.query(
        sql,
        { transaction, type: Sequelize.QueryTypes.SELECT },
      );

      // A trigger naming a column the table lacks would fail every later write to it, so
      // refuse to install anything unless the schema matches what the triggers read.
      const columns = await select(`SELECT table_name, column_name
        FROM information_schema.columns WHERE table_schema = current_schema()`);
      const present = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
      const required = Object.entries(RESOLVABLE_TABLES)
        .map(([table, spec]) => [table, requiredColumns(spec)])
        .concat([['metadata', ['id', 'resource_table', 'resource_id', 'created_at']]])
        .concat([['locations', ['updated_at', 'last_validated_at', 'created_at']]]);
      const missing = [];
      for (const [table, tableColumns] of required) {
        tableColumns
          .map(column => `${table}.${column}`)
          .filter(name => !present.has(name))
          .forEach(name => missing.push(name));
      }
      if (missing.length) {
        throw new Error(`location-change-feed: missing columns ${missing.join(', ')}`);
      }

      await query(`CREATE TABLE IF NOT EXISTS ${CHANGES} (
        location_id uuid PRIMARY KEY,
        changed_at timestamp with time zone NOT NULL
      )`);
      await query(`CREATE INDEX IF NOT EXISTS ${CHANGES}_changed_at
        ON ${CHANGES} (changed_at, location_id)`);
      await query(`CREATE TABLE IF NOT EXISTS ${DELETED} (
        resource_table text NOT NULL,
        resource_id uuid NOT NULL,
        location_id uuid,
        service_id uuid,
        deleted_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS ${DELETED}_resource
        ON ${DELETED} (resource_table, resource_id)`);
      await query(`CREATE INDEX IF NOT EXISTS ${DELETED}_service
        ON ${DELETED} (resource_table, service_id)`);
      await query(`CREATE INDEX IF NOT EXISTS ${DELETED}_deleted_at ON ${DELETED} (deleted_at)`);

      await query(createSharedFunctionsSql());
      for (const [table, spec] of Object.entries(TRACKED_TABLES)) {
        await query(createTrackFunctionSql(table, spec));
        await query(dropTriggersSql(table));
        await query(createTriggersSql(table));
      }
      await query('DROP TRIGGER IF EXISTS location_changes_metadata_insert ON metadata');
      await query(`CREATE TRIGGER location_changes_metadata_insert AFTER INSERT ON metadata
        REFERENCING NEW TABLE AS new_rows
        FOR EACH STATEMENT EXECUTE PROCEDURE location_changes_track_metadata()`);

      // Statement triggers fire even when no row matches. Running each one here plans every
      // query it holds, so a mistake fails this migration instead of the next real edit.
      for (const table of Object.keys(TRACKED_TABLES).concat('metadata')) {
        // Only `id`: some tables have generated columns, which reject an explicit value.
        await query(`INSERT INTO ${table} (id) SELECT id FROM ${table} WHERE false`);
        await query(`UPDATE ${table} SET id = id WHERE false`);
        await query(`DELETE FROM ${table} WHERE false`);
      }
      for (const table of Object.keys(RESOLVABLE_TABLES)) {
        await select(`SELECT * FROM location_changes_resolve('${table}', '${ZERO_UUID}')`);
      }

      // Start from what the locations table already knows, so a client that bootstraps with a
      // `since` before this migration still sees the locations edited in that window.
      await query(`INSERT INTO ${CHANGES} (location_id, changed_at)
        SELECT id, COALESCE(GREATEST(updated_at, last_validated_at), created_at, now())
        FROM locations
        ON CONFLICT (location_id) DO NOTHING`);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      for (const table of Object.keys(TRACKED_TABLES)) {
        await query(dropTriggersSql(table));
        await query(`DROP FUNCTION IF EXISTS ${trackFunction(table)}()`);
      }
      await query('DROP TRIGGER IF EXISTS location_changes_metadata_insert ON metadata');
      await query('DROP FUNCTION IF EXISTS location_changes_track_metadata()');
      await query('DROP FUNCTION IF EXISTS location_changes_resolve(text, uuid)');
      await query('DROP FUNCTION IF EXISTS location_changes_record(uuid[])');
      await query(`DROP TABLE IF EXISTS ${DELETED}`);
      await query(`DROP TABLE IF EXISTS ${CHANGES}`);
    });
  },
};
