module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scheduled_actions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
      },
      method: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      resource: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'scheduled',
      },
      run_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      requested_by: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      label: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      changed_fields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      max_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      last_error_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      locked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      locked_by: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      result: {
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

    await queryInterface.addIndex('scheduled_actions', ['status', 'run_at']);
    await queryInterface.addIndex('scheduled_actions', ['resource', 'resource_id']);
    await queryInterface.addIndex('scheduled_actions', ['method']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('scheduled_actions');
  },
};
