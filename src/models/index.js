/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';
import path from 'path';
import Sequelize, { DataTypes, Op } from 'sequelize';
import config from '../config';

const basename = path.basename(__filename);
const db = {};

const createSequelizeLogger = () => {
  const baseLogging = config.db.options.logging;
  const thresholdBytes = config.db.largeQueryThresholdBytes;
  const shouldLogLargeQueries = config.db.logLargeQueries;
  let baseLogger = null;

  if (typeof baseLogging === 'function') {
    baseLogger = baseLogging;
  } else if (baseLogging) {
    baseLogger = sql => process.stdout.write(`${sql}\n`);
  }

  if (!baseLogger && !shouldLogLargeQueries) {
    return false;
  }

  return (sql, ...args) => {
    if (baseLogger) {
      baseLogger(sql, ...args);
    }

    if (shouldLogLargeQueries && typeof sql === 'string') {
      const sqlSizeBytes = Buffer.byteLength(sql, 'utf8');
      if (sqlSizeBytes >= thresholdBytes) {
        const previewLength = 500;
        const queryPreview = sql.length > previewLength
          ? `${sql.slice(0, previewLength)}... [truncated]`
          : sql;

        const warningMessage = `[sequelize] Large query ${sqlSizeBytes} bytes`
          + ` (threshold ${thresholdBytes}). ${queryPreview}\n`;
        process.stderr.write(warningMessage);
      }
    }
  };
};

const sequelizeOptions = {
  ...config.db.options,
  logging: createSequelizeLogger(),
};

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  sequelizeOptions,
);

fs
  .readdirSync(__dirname)
  .filter(file => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
  .forEach((file) => {
    const model = require(`./${file}`)(sequelize, DataTypes, Op);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
