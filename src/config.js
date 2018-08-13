const parseBoolean = (value, defaultValue = false) =>
  (value == null ? defaultValue : value.toLowerCase() === 'true');
const parseNumber = (value, defaultValue) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export default {
  port: process.env.PORT || 3000,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  db: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseNumber(process.env.DATABASE_PORT, 5432),
      logging: parseBoolean(process.env.DATABASE_LOGGING, true),
      dialect: 'postgres',
      pool: {
        max: parseNumber(process.env.DATABASE_POOL_MAX, 100),
        min: parseNumber(process.env.DATABASE_POOL_MIN, 0),
        idle: parseNumber(process.env.DATABASE_POOL_IDLE_TIME, 10000),
      },
    },
  },
};
