/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import fs from 'fs';
import path from 'path';
import Sequelize, { DataTypes, Op } from 'sequelize';
import config from '../config';

const basename = path.basename(__filename);
const db = {};

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  config.db.options,
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
