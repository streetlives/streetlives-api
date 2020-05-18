export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('metadata', 'source', Sequelize.TEXT),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('metadata', 'source'),
  ]),
};
