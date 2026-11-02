import { ValidationError } from './errors';

export const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

// Postgres keeps microseconds and a JS Date keeps milliseconds. A cursor built from a Date
// would sort before rows sharing its millisecond and serve them again forever, so the
// timestamp stays the exact text Postgres produced (see TIMESTAMP_CURSOR_SQL).
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TIMESTAMP_CURSOR_SQL = column =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const encodeChangeFeedCursor = ({ at, id }) => Buffer.from(`${at}|${id}`)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

export const decodeChangeFeedCursor = (cursor) => {
  const text = Buffer.from(
    String(cursor).replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
  const [at, id, ...rest] = text.split('|');
  if (rest.length || !TIMESTAMP_PATTERN.test(at || '') || !UUID_PATTERN.test(id || '')) {
    throw new ValidationError('Invalid cursor');
  }
  return { at, id };
};

// Where a request starts reading: just after its cursor, or at `since` inclusive.
export const resolveChangeFeedPosition = ({ since, cursor }) => {
  if (cursor) {
    return decodeChangeFeedCursor(cursor);
  }
  return { at: new Date(since).toISOString(), id: EMPTY_UUID };
};

export default {
  EMPTY_UUID,
  TIMESTAMP_CURSOR_SQL,
  encodeChangeFeedCursor,
  decodeChangeFeedCursor,
  resolveChangeFeedPosition,
};
