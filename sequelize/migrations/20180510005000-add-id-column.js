export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('service_languages', 'id', Sequelize.UUID),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('service_languages', 'id'),
  ]),
};

