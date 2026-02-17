import { parseBoolean, parseNumber } from './utils/strings';

export default {
  port: process.env.PORT || 3000,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  adminGroupName: process.env.ADMIN_GROUP_NAME || 'StreetlivesAdmins',
  db: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseNumber(process.env.DATABASE_PORT, 5432),
      logging: parseBoolean(process.env.DATABASE_LOGGING, true),
      dialect: 'postgres',
      operatorsAliases: false,
      pool: {
        max: parseNumber(process.env.DATABASE_POOL_MAX, 1),
        min: parseNumber(process.env.DATABASE_POOL_MIN, 0),
        // idle: parseNumber(process.env.DATABASE_POOL_IDLE_TIME, 10000), // let the RDS proxy handle timeout
      },
      dialectOptions: {
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
