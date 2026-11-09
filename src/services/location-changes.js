import models from '../models';
import config from '../config';
import {
  TIMESTAMP_CURSOR_SQL,
  encodeChangeFeedCursor,
  resolveChangeFeedPosition,
} from '../utils/change-feed-cursor';

export const LOCATION_CHANGES_DEFAULT_LIMIT = 500;
export const LOCATION_CHANGES_MAX_LIMIT = 1000;
export const LOCATION_EDITS_DEFAULT_LIMIT = 100;
// Edits carry before/after text (whole descriptions), so pages stay well under Lambda's 6MB.
export const LOCATION_EDITS_MAX_LIMIT = 250;

// How a row of each table leads to the locations whose GET /locations/:id response includes it.
const DETAIL_TABLES = {
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
  error_reports: { links: ['location_id'] },
};

const RESOLVABLE_TABLES = { ...DETAIL_TABLES, ...ATTRIBUTION_ONLY_TABLES };

// The columns a deleted row's own metadata may have recorded, which still lead to a location.
const LINK_FIELDS = ['location_id', 'service_id', 'service_at_location_id', 'organization_id'];
const UUID_SQL = "'^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'";
const sqlList = values => values.map(value => `'${value}'`).join(', ');
const recordedValue = alias => `COALESCE(${alias}.replacement_value, ${alias}.previous_value)`;

const normalizeLimit = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

// Rows become visible at commit, which can be after their timestamp. Only rows older than
// every still-open transaction that has written something are served: anything such a
// transaction writes is stamped at or after its start, so a cursor can never move past it,
// however long it stays open. pg_stat_activity shows the start of other sessions only for
// this role (or with pg_read_all_stats); the settle interval also covers short clock skew.
const settledBeforeSql = () => `LEAST(
  now() - make_interval(secs => ${Number(config.changeFeed.settleSeconds) || 0}),
  COALESCE((SELECT min(a.xact_start) FROM pg_stat_activity a
    WHERE a.backend_xid IS NOT NULL AND a.pid <> pg_backend_pid()), 'infinity'::timestamptz))`;

// (edit_id, location_id, service_id) for each `edits` row whose resource still exists.
const liveLinkSql = (table, link, serviceColumn) => {
  const from = `FROM edits e JOIN ${table} r
    ON e.resource_table = '${table}' AND r.id = e.resource_id`;
  switch (link) {
    case 'self_location':
      return `SELECT e.edit_id, r.id AS location_id, NULL::uuid AS service_id ${from}`;
    case 'self_organization':
      return `SELECT e.edit_id, l.id AS location_id, NULL::uuid AS service_id ${from}
        JOIN locations l ON l.organization_id = r.id`;
    case 'self_service':
      return `SELECT e.edit_id, sal.location_id, r.id AS service_id ${from}
        LEFT JOIN service_at_locations sal ON sal.service_id = r.id`;
    case 'location_id':
      return `SELECT e.edit_id, r.location_id,
          ${serviceColumn ? `r.${serviceColumn}` : 'NULL::uuid'} AS service_id ${from}
        WHERE r.location_id IS NOT NULL`;
    case 'service_id':
      return `SELECT e.edit_id, sal.location_id, r.service_id ${from}
        LEFT JOIN service_at_locations sal ON sal.service_id = r.service_id
        WHERE r.service_id IS NOT NULL`;
    case 'service_at_location_id':
      return `SELECT e.edit_id, sal.location_id, sal.service_id ${from}
        JOIN service_at_locations sal ON sal.id = r.service_at_location_id`;
    case 'organization_id':
      return `SELECT e.edit_id, l.id AS location_id, NULL::uuid AS service_id ${from}
        JOIN locations l ON l.organization_id = r.organization_id`;
    default:
      throw new Error(`Unknown location link ${link}`);
  }
};

// CTEs that resolve the rows of an `edits` CTE (edit_id, resource_table, resource_id) into
// `resolved` (edit_id, location_id, service_id). A resource that still exists is followed
// through the tables as they are now. One that has been deleted is followed through the link
// columns its own metadata recorded (written on create, and on every delete made through
// destroyAllInstances), and a service through the service_at_locations rows recorded for it.
const RESOLVER_CTES = () => {
  const tables = Object.entries(RESOLVABLE_TABLES);
  const live = tables
    .flatMap(([table, { links, serviceColumn }]) =>
      links.map(link => liveLinkSql(table, link, serviceColumn)))
    .join('\n    UNION ALL ');
  const existing = tables
    .map(([table]) => `SELECT e.edit_id FROM edits e JOIN ${table} r
      ON e.resource_table = '${table}' AND r.id = e.resource_id`)
    .join('\n    UNION ALL ');

  return `
  live AS (
    ${live}
  ),
  gone AS (
    SELECT e.* FROM edits e
    WHERE e.resource_table IN (${sqlList(Object.keys(RESOLVABLE_TABLES))})
      AND e.edit_id NOT IN (${existing})
  ),
  gone_links AS (
    SELECT g.edit_id,
      CASE g.resource_table
        WHEN 'locations' THEN 'location_id'
        WHEN 'services' THEN 'service_id'
        ELSE 'organization_id'
      END AS link,
      g.resource_id AS target_id
    FROM gone g
    WHERE g.resource_table IN ('locations', 'services', 'organizations')
    UNION ALL
    SELECT recorded.edit_id, recorded.link, recorded.value::uuid
    FROM (
      SELECT DISTINCT ON (g.edit_id, h.field_name)
        g.edit_id, h.field_name AS link, ${recordedValue('h')} AS value
      FROM gone g
      JOIN metadata h ON h.resource_id = g.resource_id AND h.resource_table = g.resource_table
      WHERE h.field_name IN (${sqlList(LINK_FIELDS)})
      ORDER BY g.edit_id, h.field_name, h.created_at DESC, h.id DESC
    ) recorded
    WHERE recorded.value ~* ${UUID_SQL}
  ),
  recorded_service_locations AS (
    SELECT g.target_id AS service_id, location.value::uuid AS location_id
    FROM gone_links g
    JOIN metadata link ON link.resource_table = 'service_at_locations'
      AND link.field_name = 'service_id'
      AND ${recordedValue('link')} = g.target_id::text
    JOIN LATERAL (
      SELECT ${recordedValue('m')} AS value FROM metadata m
      WHERE m.resource_table = 'service_at_locations' AND m.resource_id = link.resource_id
        AND m.field_name = 'location_id'
    ) location ON location.value ~* ${UUID_SQL}
    WHERE g.link = 'service_id'
  ),
  resolved AS (
    SELECT * FROM live
    UNION ALL
    SELECT g.edit_id, g.target_id, NULL::uuid FROM gone_links g WHERE g.link = 'location_id'
    UNION ALL
    SELECT g.edit_id, sal.location_id, g.target_id
    FROM gone_links g JOIN service_at_locations sal ON sal.service_id = g.target_id
    WHERE g.link = 'service_id'
    UNION ALL
    SELECT DISTINCT g.edit_id, r.location_id, g.target_id
    FROM gone_links g JOIN recorded_service_locations r ON r.service_id = g.target_id
    WHERE g.link = 'service_id'
    UNION ALL
    SELECT g.edit_id, sal.location_id, sal.service_id
    FROM gone_links g JOIN service_at_locations sal ON sal.id = g.target_id
    WHERE g.link = 'service_at_location_id'
    UNION ALL
    SELECT g.edit_id, ${recordedValue('m')}::uuid, NULL::uuid
    FROM gone_links g JOIN metadata m ON m.resource_table = 'service_at_locations'
      AND m.resource_id = g.target_id AND m.field_name = 'location_id'
    WHERE g.link = 'service_at_location_id' AND ${recordedValue('m')} ~* ${UUID_SQL}
    UNION ALL
    SELECT g.edit_id, l.id, NULL::uuid
    FROM gone_links g JOIN locations l ON l.organization_id = g.target_id
    WHERE g.link = 'organization_id'
  )`;
};

// Each change is a metadata row (by when it was written, since an admin may backdate
// last_action_date) or a holiday schedule passing its `valid_to`: the row then drops out of
// GET /locations/:id the next day (New York time) without anything being written.
const LOCATION_CHANGES_SQL = () => `
  WITH horizon AS (
    SELECT ${settledBeforeSql()} AS settled_before
  ),
  written AS (
    SELECT m.id AS edit_id, m.resource_table, m.resource_id, m.created_at AS at
    FROM metadata m
    WHERE (m.created_at, m.id) > ($1::timestamptz, $2::uuid)
      AND m.created_at < (SELECT settled_before FROM horizon)
      AND m.resource_table IN (${sqlList(Object.keys(DETAIL_TABLES))})
    ORDER BY m.created_at, m.id
    LIMIT $3
  ),
  expired AS (
    SELECT * FROM (
      SELECT hs.id AS edit_id, 'holiday_schedules'::text AS resource_table,
        hs.id AS resource_id,
        ((hs.valid_to + 1)::timestamp AT TIME ZONE 'America/New_York') AS at
      FROM holiday_schedules hs
      WHERE hs.valid_to >= ($1::timestamptz AT TIME ZONE 'America/New_York')::date - 1
        AND hs.valid_to <
          ((SELECT settled_before FROM horizon) AT TIME ZONE 'America/New_York')::date
    ) x
    WHERE (x.at, x.edit_id) > ($1::timestamptz, $2::uuid)
  ),
  edits AS (
    SELECT * FROM (SELECT * FROM written UNION ALL SELECT * FROM expired) x
    ORDER BY x.at, x.edit_id
    LIMIT $3
  ),
  ${RESOLVER_CTES()}
  SELECT e.edit_id::text AS edit_id,
    e.at AS changed_at,
    COALESCE(array_agg(DISTINCT r.location_id::text)
      FILTER (WHERE r.location_id IS NOT NULL), ARRAY[]::text[]) AS location_ids,
    COALESCE(array_agg(DISTINCT r.location_id::text)
      FILTER (WHERE r.location_id IS NOT NULL AND l.id IS NULL), ARRAY[]::text[])
      AS deleted_location_ids,
    ${TIMESTAMP_CURSOR_SQL('e.at')} AS cursor_at
  FROM edits e
  LEFT JOIN resolved r ON r.edit_id = e.edit_id
  LEFT JOIN locations l ON l.id = r.location_id
  GROUP BY e.edit_id, e.at
  ORDER BY e.at, e.edit_id
`;

const LOCATION_EDITS_SQL = () => `
  WITH horizon AS (
    SELECT ${settledBeforeSql()} AS settled_before
  ),
  edits AS (
    SELECT m.id AS edit_id, m.resource_table, m.resource_id
    FROM metadata m
    WHERE (m.created_at, m.id) > ($1::timestamptz, $2::uuid)
      AND m.created_at < (SELECT settled_before FROM horizon)
    ORDER BY m.created_at, m.id
    LIMIT $3
  ),
  ${RESOLVER_CTES()},
  attributed AS (
    SELECT r.edit_id,
      array_agg(DISTINCT r.location_id::text)
        FILTER (WHERE r.location_id IS NOT NULL) AS location_ids,
      (array_agg(r.service_id::text) FILTER (WHERE r.service_id IS NOT NULL))[1] AS service_id
    FROM resolved r
    GROUP BY r.edit_id
  )
  SELECT p.id::text AS id,
    p.resource_table,
    p.resource_id::text AS resource_id,
    p.field_name,
    p.last_action_type::text AS last_action_type,
    p.last_action_date,
    p.created_at,
    p.updated_by,
    p.source,
    p.previous_value,
    p.replacement_value,
    COALESCE(a.location_ids, ARRAY[]::text[]) AS location_ids,
    a.service_id,
    ${TIMESTAMP_CURSOR_SQL('p.created_at')} AS cursor_at
  FROM edits e
  JOIN metadata p ON p.id = e.edit_id
  LEFT JOIN attributed a ON a.edit_id = e.edit_id
  ORDER BY p.created_at, p.id
`;

const readPage = async (sql, { since, cursor, limit }, { idKey }) => {
  const position = resolveChangeFeedPosition({ since, cursor });
  const rows = await models.sequelize.query(sql, {
    bind: [position.at, position.id, limit + 1],
    type: models.Sequelize.QueryTypes.SELECT,
  });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    rows: pageRows.map((row) => {
      const published = { ...row };
      delete published.cursor_at;
      return published;
    }),
    // An empty page hands the position back, so a client can always store nextCursor.
    nextCursor: encodeChangeFeedCursor(last ? { at: last.cursor_at, id: last[idKey] } : position),
    hasMore,
    serverTime: new Date().toISOString(),
  };
};

// `limit` counts changes read, not locations: one organization edit lists all its locations,
// and a location changed again on a later page is listed again there.
export const getLocationChanges = async ({ since, cursor, limit } = {}) => {
  const { rows, ...rest } = await readPage(LOCATION_CHANGES_SQL(), {
    since,
    cursor,
    limit: normalizeLimit(limit, LOCATION_CHANGES_DEFAULT_LIMIT, LOCATION_CHANGES_MAX_LIMIT),
  }, { idKey: 'edit_id' });

  // Rows come oldest first, so each location ends up at its latest change on this page.
  const latest = new Map();
  rows.forEach(({ changed_at: changedAt, location_ids: ids, deleted_location_ids: deleted }) =>
    ids.forEach(id => latest.set(id, {
      location_id: id,
      changed_at: changedAt,
      deleted: deleted.includes(id),
    })));
  const changes = [...latest.values()].sort((a, b) =>
    (a.changed_at - b.changed_at) || a.location_id.localeCompare(b.location_id));

  return { changes, ...rest };
};

export const getLocationEdits = async ({ since, cursor, limit } = {}) => {
  const { rows, ...rest } = await readPage(LOCATION_EDITS_SQL(), {
    since,
    cursor,
    limit: normalizeLimit(limit, LOCATION_EDITS_DEFAULT_LIMIT, LOCATION_EDITS_MAX_LIMIT),
  }, { idKey: 'id' });
  return { edits: rows, ...rest };
};

export default { getLocationChanges, getLocationEdits };
