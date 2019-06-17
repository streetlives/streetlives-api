jest.setTimeout(10000);

process.env.DATABASE_NAME = 'test';
process.env.DATABASE_LOGGING = 'false';

const models = require('../src/models');

beforeAll(() => models.sequelize.sync({ force: true }));
afterAll(() => models.sequelize.close());
