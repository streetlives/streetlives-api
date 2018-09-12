export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('comments', 'reply_to_id', Sequelize.UUID),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('comments', 'reply_to_id'),
  ]),
};
