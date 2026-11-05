import { parseBoolean, parseNumber } from './utils/strings';
import { sslDialectOptions } from './utils/ssl';

export default {
  port: process.env.PORT || 3000,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  adminGroupName: process.env.ADMIN_GROUP_NAME || 'StreetlivesAdmins',
  providerGroupName: process.env.PROVIDER_GROUP_NAME || 'Providers',
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
        // Verified TLS against AWS's RDS trust store. Migrations reach this
        // config too - any migration importing src/models opens a connection
        // through it - so it has to be as safe as the CLI's own.
        ...sslDialectOptions(process.env.NODE_ENV),
      },
    },
  },
  appUrl: process.env.APP_URL || '',
  mail: {
    host: process.env.MAIL_HOST,
    port: parseNumber(process.env.MAIL_PORT, 587),
    username: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM,
  },
  // Organization-provided location photos (issue #735). Read through getters
  // rather than captured at import: the storage driver is chosen per call so
  // tests can flip these without re-importing the module graph, and nothing
  // here may throw at import time - config.js is pulled in by any migration
  // that imports src/models, so a throw would break db:migrate.
  locationPhotos: {
    get bucket() { return process.env.LOCATION_PHOTO_S3_BUCKET; },
    get region() { return process.env.LOCATION_PHOTO_S3_REGION || 'us-east-1'; },
    get publicBaseUrl() { return process.env.LOCATION_PHOTO_PUBLIC_BASE_URL; },
    get keyPrefix() { return process.env.LOCATION_PHOTO_KEY_PREFIX || 'location-photos'; },
    get maxBytes() {
      return parseNumber(process.env.LOCATION_PHOTO_MAX_BYTES, 4 * 1024 * 1024);
    },
    get driver() { return process.env.LOCATION_PHOTO_STORAGE_DRIVER; },
  },
};
