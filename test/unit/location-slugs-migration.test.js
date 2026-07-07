const migration = require('../../sequelize/migrations/20240325142525-location-slugs');

describe('location-slugs migration', () => {
  const runMigration = async () => {
    const queryInterface = {
      addColumn: jest.fn(() => Promise.resolve()),
      addIndex: jest.fn(() => Promise.resolve()),
      createTable: jest.fn(() => Promise.resolve()),
      sequelize: {
        transaction: jest.fn(callback => callback({})),
        query: jest.fn(() => Promise.resolve()),
      },
    };
    const Sequelize = {
      DataTypes: {
        DATE: 'DATE',
        STRING: 'STRING',
        UUID: 'UUID',
      },
      QueryTypes: {
        INSERT: 'INSERT',
      },
    };

    await migration.up(queryInterface, Sequelize);

    return { queryInterface, Sequelize };
  };

  it('adds physical_addresses.neighborhood in test migrations', async () => {
    const { queryInterface, Sequelize } = await runMigration();

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'physical_addresses',
      'neighborhood',
      { type: Sequelize.DataTypes.STRING },
    );
  });
});
