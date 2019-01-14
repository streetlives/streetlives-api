export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('locations', 'hidden_from_search', Sequelize.BOOLEAN),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('locations', 'hidden_from_search'),
  ]),
};
