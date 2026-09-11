
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('location_comment_highlights', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'locations',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      last_comment_timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      openai_output_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('location_comment_highlights');
  },
};
