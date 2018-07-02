/* eslint-disable import/no-extraneous-dependencies */
require('babel-core/register');

const env = process.env.NODE_ENV || 'development';

module.exports = {
  [env]: {
    database: process.env.DATABASE_NAME || 'streetlives',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST || 'localhost',
    port: process.env.DATABASE_PORT || 5432,
    dialect: 'postgres',
  },
};
