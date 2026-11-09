module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('location_deletion_schedules', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: {
            tableName: 'locations',
          },
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      requested_by: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      scheduled_for_permanent_deletion_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deleted_service_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      was_hidden_from_search: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('location_deletion_schedules');
  },
};
