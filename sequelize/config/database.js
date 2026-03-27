/* eslint-disable import/no-extraneous-dependencies */
require('dotenv').config({ path: '.env.local' });
require('@babel/register');

const baseConfig = {
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  host: process.env.DATABASE_HOST || 'localhost',
  port: process.env.DATABASE_PORT || 5432,
  dialect: 'postgres',
  operatorsAliases: false,
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig,
};

