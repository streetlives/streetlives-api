/* eslint-disable import/no-extraneous-dependencies */
require('@babel/register');

const env = process.env.NODE_ENV || 'development';

module.exports = {
  [env]: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST || 'localhost',
    port: process.env.DATABASE_PORT || 5432,
    dialect: 'postgres',
    operatorsAliases: false,
    dialectOptions: {
      // Local/CI test databases run without SSL; RDS in dev/prod requires it.
      // Mirrors the dialectOptions in src/config.js so the CLI's own connection
      // (SequelizeMeta, queryInterface) can reach RDS the same way the app does.
      ...(env === 'test' ? {} : {
        ssl: {
          require: true,
          rejectUnauthorized: false, // For RDS, accept AWS certificates
        },
      }),
    },
  },
};
