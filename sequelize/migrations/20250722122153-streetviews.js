'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('streetviews', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'locations', // make sure this matches your existing table name
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      streetview_url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      posted_by: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('streetviews');
  },
};
