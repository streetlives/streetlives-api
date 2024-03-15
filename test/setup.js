jest.setTimeout(10000);

process.env.DATABASE_NAME = 'test';
process.env.DATABASE_LOGGING = 'false';

const models = require('../src/models');

beforeAll(async () => { 
  try {
    await models.sequelize.sync({ force: true })
  } catch (e){
    console.error(e);
  }
});
afterAll(() => models.sequelize.close());
