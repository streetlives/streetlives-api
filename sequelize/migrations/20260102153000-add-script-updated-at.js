module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.addColumn(
        'locations',
        'script_updated_at',
        { type: Sequelize.DataTypes.DATE },
        { transaction: t },
      ),
      queryInterface.addColumn(
        'services',
        'script_updated_at',
        { type: Sequelize.DataTypes.DATE },
        { transaction: t },
      ),
      queryInterface.addColumn(
        'phones',
        'script_updated_at',
        { type: Sequelize.DataTypes.DATE },
        { transaction: t },
      ),
      queryInterface.addColumn(
        'organizations',
        'script_updated_at',
        { type: Sequelize.DataTypes.DATE },
        { transaction: t },
      ),
      queryInterface.addColumn(
        'physical_addresses',
        'script_updated_at',
        { type: Sequelize.DataTypes.DATE },
        { transaction: t },
      ),
    ]));
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.removeColumn('locations', 'script_updated_at', { transaction: t }),
      queryInterface.removeColumn('services', 'script_updated_at', { transaction: t }),
      queryInterface.removeColumn('phones', 'script_updated_at', { transaction: t }),
      queryInterface.removeColumn('organizations', 'script_updated_at', { transaction: t }),
      queryInterface.removeColumn('physical_addresses', 'script_updated_at', { transaction: t }),
    ]));
  },
};
