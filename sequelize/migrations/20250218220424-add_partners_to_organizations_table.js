module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('organizations', 'partners', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('organizations', 'partners');
  },
};
