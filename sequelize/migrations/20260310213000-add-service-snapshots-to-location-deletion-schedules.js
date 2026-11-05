module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('location_deletion_schedules', 'service_snapshots', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('location_deletion_schedules', 'service_snapshots');
  },
};
