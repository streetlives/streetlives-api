export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('comments', 'contact_info', Sequelize.TEXT),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('comments', 'contact_info'),
  ]),
};
