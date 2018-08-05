export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.changeColumn('metadata', 'updated_by', {
      allowNull: true,
      type: Sequelize.TEXT,
    }),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.changeColumn('metadata', 'updated_by', {
      allowNull: false,
      type: Sequelize.TEXT,
    }),
  ]),
};
