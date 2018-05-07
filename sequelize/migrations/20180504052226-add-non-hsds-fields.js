export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('locations', 'additional_info', Sequelize.TEXT),
    queryInterface.addColumn('services', 'additional_info', Sequelize.TEXT),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('locations', 'additional_info'),
    queryInterface.removeColumn('services', 'additional_info'),
  ]),
};
