const parseBoolean = (value, defaultValue = false) =>
  (value == null ? defaultValue : value.toLowerCase() === 'true');

export default {
  port: process.env.PORT || 3000,
  db: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: process.env.DATABASE_PORT || 5432,
      logging: parseBoolean(process.env.DATABASE_LOGGING, true),
      dialect: 'postgres',
      pool: {
        max: 100,
        min: 0,
        idle: 10000,
      },
    },
  },
};
