export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('comments', 'hidden', Sequelize.BOOLEAN),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('comments', 'hidden'),
  ]),
};
