export default {
  up: (queryInterface, Sequelize) => Promise.all([
    queryInterface.addColumn('holiday_schedules', 'weekday', Sequelize.INTEGER),
    queryInterface.addColumn('holiday_schedules', 'occasion', Sequelize.TEXT),
    queryInterface.changeColumn('holiday_schedules', 'start_date', {
      type: Sequelize.DATEONLY, allowNull: true,
    }),
    queryInterface.changeColumn('holiday_schedules', 'end_date', {
      type: Sequelize.DATEONLY, allowNull: true,
    }),
  ]),

  down: (queryInterface, Sequelize) => Promise.all([
    queryInterface.removeColumn('holiday_schedules', 'weekday'),
    queryInterface.removeColumn('holiday_schedules', 'occasion'),
    queryInterface.changeColumn('holiday_schedules', 'start_date', {
      type: Sequelize.DATEONLY, allowNull: false,
    }),
    queryInterface.changeColumn('holiday_schedules', 'end_date', {
      type: Sequelize.DATEONLY, allowNull: false,
    }),
  ]),
};
