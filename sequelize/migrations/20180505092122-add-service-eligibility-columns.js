export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('services', 'ages_served', Sequelize.JSON),
    queryInterface.addColumn('services', 'who_does_it_serve', Sequelize.JSON),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('services', 'ages_served'),
    queryInterface.removeColumn('services', 'who_does_it_serve'),
  ]),
};
