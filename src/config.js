import { parseBoolean, parseNumber } from './utils/strings';

const DEFAULT_INTERNAL_CATALOG_ALLOWED_HOSTS = ['sheets.doobneek.org'];
const DEFAULT_INTERNAL_CATALOG_ALLOWED_ORIGIN_PATTERNS = ['chrome-extension://*'];
const DEFAULT_INTERNAL_CATALOG_ALLOWED_GROUPS = [];
const DEFAULT_INTERNAL_CATALOG_MAX_RADIUS_METERS = Math.round(20 * 1609.344);
const DEFAULT_INTERNAL_CATALOG_DEFAULT_PAGE_SIZE = 500;
const DEFAULT_INTERNAL_CATALOG_MAX_PAGE_SIZE = 1000;

const parseCsv = (value, fallback = []) => {
  if (typeof value !== 'string') return fallback;
  const parsed = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || null;
const cognitoUserPoolRegion = process.env.COGNITO_USER_POOL_REGION
  || (cognitoUserPoolId && cognitoUserPoolId.includes('_') ? cognitoUserPoolId.split('_')[0] : null);
const cognitoUserPoolIssuer = process.env.COGNITO_USER_POOL_ISSUER || (cognitoUserPoolId
  ? `https://cognito-idp.${cognitoUserPoolRegion}.amazonaws.com/${cognitoUserPoolId}`
  : null);
const internalCatalogMaxPageSize = parseNumber(
  process.env.INTERNAL_LOCATION_CATALOG_MAX_PAGE_SIZE,
  DEFAULT_INTERNAL_CATALOG_MAX_PAGE_SIZE,
);

export default {
  port: process.env.PORT || 3000,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  adminGroupName: process.env.ADMIN_GROUP_NAME || 'StreetlivesAdmins',
  cognito: {
    userPoolId: cognitoUserPoolId,
    userPoolRegion: cognitoUserPoolRegion,
    userPoolIssuer: cognitoUserPoolIssuer,
  },
  internalLocationCatalog: {
    allowedOriginHosts: parseCsv(
      process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_HOSTS,
      DEFAULT_INTERNAL_CATALOG_ALLOWED_HOSTS,
    ),
    allowedOriginPatterns: parseCsv(
      process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_ORIGIN_PATTERNS,
      DEFAULT_INTERNAL_CATALOG_ALLOWED_ORIGIN_PATTERNS,
    ),
    allowedClientIds: parseCsv(
      process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_CLIENT_IDS,
      [],
    ),
    allowedGroupNames: parseCsv(
      process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_GROUP_NAMES,
      DEFAULT_INTERNAL_CATALOG_ALLOWED_GROUPS,
    ),
    maxRadiusMeters: parseNumber(
      process.env.INTERNAL_LOCATION_CATALOG_MAX_RADIUS_METERS,
      DEFAULT_INTERNAL_CATALOG_MAX_RADIUS_METERS,
    ),
    defaultPageSize: Math.min(
      parseNumber(
        process.env.INTERNAL_LOCATION_CATALOG_DEFAULT_PAGE_SIZE,
        DEFAULT_INTERNAL_CATALOG_DEFAULT_PAGE_SIZE,
      ),
      internalCatalogMaxPageSize,
    ),
    maxPageSize: internalCatalogMaxPageSize,
  },
  db: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    largeQueryThresholdBytes: parseNumber(
      process.env.DATABASE_LARGE_QUERY_THRESHOLD_BYTES,
      12288,
    ),
    logLargeQueries: parseBoolean(process.env.DATABASE_LOG_LARGE_QUERIES, true),
    options: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseNumber(process.env.DATABASE_PORT, 5432),
      logging: parseBoolean(process.env.DATABASE_LOGGING, true),
      dialect: 'postgres',
      // Avoid sequelize connection-level SET commands that trigger RDS Proxy session pinning.
      keepDefaultTimezone: parseBoolean(process.env.DATABASE_KEEP_DEFAULT_TIMEZONE, true),
      operatorsAliases: false,
      pool: {
        max: parseNumber(process.env.DATABASE_POOL_MAX, 1),
        min: parseNumber(process.env.DATABASE_POOL_MIN, 0),
        // idle: parseNumber(process.env.DATABASE_POOL_IDLE_TIME, 10000),
        // let the RDS proxy handle timeout
      },
      dialectOptions: {
        // Prevent `SET client_min_messages` so RDS Proxy can reuse pooled connections.
        clientMinMessages: process.env.DATABASE_CLIENT_MIN_MESSAGES || 'ignore',
        ssl: {
          require: true,
          rejectUnauthorized: false, // For RDS, set to false to accept AWS certificates
        },
      },
    },
  },
  mail: {
    host: process.env.MAIL_HOST,
    port: parseNumber(process.env.MAIL_PORT, 587),
    username: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM,
  },
};
