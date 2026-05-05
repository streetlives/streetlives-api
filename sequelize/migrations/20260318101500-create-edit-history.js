module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('edit_history', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      service_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      phone_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      page_path: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      user_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      user_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      action: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      field: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      label: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      before_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      after_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      resource_table: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      resource_id: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      source: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      action_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      copyedit: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('edit_history', ['location_id', 'action_at']);
    await queryInterface.addIndex('edit_history', ['user_key', 'action_at']);
    await queryInterface.addIndex('edit_history', ['user_name', 'action_at']);
    await queryInterface.addIndex('edit_history', ['page_path']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('edit_history');
  },
};
