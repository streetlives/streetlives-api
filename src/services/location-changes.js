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

const normalizeLimit = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

// Rows become visible at commit, which can be after their timestamp. Holding back the newest
// few minutes means a cursor never moves past a row that hasn't committed yet.
const settledBeforeSql = () =>
  `now() - make_interval(secs => ${Number(config.changeFeed.settleSeconds) || 0})`;

// Holiday schedule rows drop out of GET /locations/:id the day after `valid_to` (New York
// time) without anything being written, so their expiry counts as a change on its own.
const LOCATION_CHANGES_SQL = () => `
  WITH expiring AS (
    SELECT hs.location_id, hs.service_id, hs.service_at_location_id,
      ((hs.valid_to + 1)::timestamp AT TIME ZONE 'America/New_York') AS changed_at
    FROM holiday_schedules hs
    WHERE hs.valid_to >= ($1::timestamptz AT TIME ZONE 'America/New_York')::date - 1
      AND hs.valid_to < ((${settledBeforeSql()}) AT TIME ZONE 'America/New_York')::date
  ),
  candidates AS (
    SELECT lc.location_id, lc.changed_at
    FROM location_changes lc
    WHERE lc.changed_at >= $1::timestamptz AND lc.changed_at <= ${settledBeforeSql()}
    UNION ALL
    SELECT e.location_id, e.changed_at FROM expiring e WHERE e.location_id IS NOT NULL
    UNION ALL
    SELECT sal.location_id, e.changed_at
    FROM expiring e JOIN service_at_locations sal ON sal.service_id = e.service_id
    UNION ALL
    SELECT sal.location_id, e.changed_at
    FROM expiring e JOIN service_at_locations sal ON sal.id = e.service_at_location_id
  ),
  latest AS (
    SELECT c.location_id, max(c.changed_at) AS changed_at
    FROM candidates c
    WHERE c.changed_at >= $1::timestamptz AND c.changed_at <= ${settledBeforeSql()}
    GROUP BY c.location_id
  )
  SELECT latest.location_id::text AS location_id,
    latest.changed_at,
    ${TIMESTAMP_CURSOR_SQL('latest.changed_at')} AS cursor_at,
    NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = latest.location_id) AS deleted
  FROM latest
  WHERE (latest.changed_at, latest.location_id) > ($1::timestamptz, $2::uuid)
  ORDER BY latest.changed_at, latest.location_id
  LIMIT $3
`;

const LOCATION_EDITS_SQL = () => `
  WITH page AS (
    SELECT m.*
    FROM metadata m
    WHERE (m.created_at, m.id) > ($1::timestamptz, $2::uuid)
      AND m.created_at <= ${settledBeforeSql()}
    ORDER BY m.created_at, m.id
    LIMIT $3
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
    COALESCE(resolved.location_ids, ARRAY[]::text[]) AS location_ids,
    resolved.service_id,
    ${TIMESTAMP_CURSOR_SQL('p.created_at')} AS cursor_at
  FROM page p
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT r.location_id::text)
        FILTER (WHERE r.location_id IS NOT NULL) AS location_ids,
      (array_agg(r.service_id::text) FILTER (WHERE r.service_id IS NOT NULL))[1] AS service_id
    FROM location_changes_resolve(p.resource_table, p.resource_id) r
  ) resolved ON true
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

export const getLocationChanges = async ({ since, cursor, limit } = {}) => {
  const page = await readPage(LOCATION_CHANGES_SQL(), {
    since,
    cursor,
    limit: normalizeLimit(limit, LOCATION_CHANGES_DEFAULT_LIMIT, LOCATION_CHANGES_MAX_LIMIT),
  }, { idKey: 'location_id' });
  const { rows, ...rest } = page;
  return { changes: rows, ...rest };
};

export const getLocationEdits = async ({ since, cursor, limit } = {}) => {
  const page = await readPage(LOCATION_EDITS_SQL(), {
    since,
    cursor,
    limit: normalizeLimit(limit, LOCATION_EDITS_DEFAULT_LIMIT, LOCATION_EDITS_MAX_LIMIT),
  }, { idKey: 'id' });
  const { rows, ...rest } = page;
  return { edits: rows, ...rest };
};

export default { getLocationChanges, getLocationEdits };
