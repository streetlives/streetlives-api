// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('public_calling_state', {
      key: { type: Sequelize.TEXT, primaryKey: true, allowNull: false },
      state: { type: Sequelize.JSONB, allowNull: false },
    });
  },
  down: queryInterface => queryInterface.dropTable('public_calling_state'),
};
