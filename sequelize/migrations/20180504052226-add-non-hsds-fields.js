export default {
  up: (queryInterface, Sequelize) =>
    queryInterface.addColumn('locations', 'additional_info', Sequelize.STRING),

  down: (queryInterface, Sequelize) =>
    queryInterface.removeColumn('locations', 'additional_info'),
};
