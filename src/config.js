import { parseBoolean, parseNumber } from './utils/strings';

const databaseHost = process.env.DATABASE_HOST || 'localhost';
const databaseSsl = parseBoolean(
  process.env.DATABASE_SSL,
  databaseHost !== 'localhost' && process.env.NODE_ENV !== 'test',
);

export default {
  port: process.env.PORT || 3000,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  adminGroupName: process.env.ADMIN_GROUP_NAME || 'StreetlivesAdmins',
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
      host: databaseHost,
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
        ssl: databaseSsl ? {
          require: true,
          rejectUnauthorized: false, // For RDS, set to false to accept AWS certificates
        } : false,
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
