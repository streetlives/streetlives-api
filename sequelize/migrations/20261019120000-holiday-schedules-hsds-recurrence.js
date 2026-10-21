// Adds HSDS 3.0 `schedule` recurrence and validity fields to holiday_schedules.
// Expand step only: start_date/end_date stay and are mirrored into valid_from/valid_to.
const columns = Sequelize => ({
  freq: Sequelize.TEXT,
  interval: Sequelize.INTEGER,
  byday: Sequelize.TEXT,
  bymonthday: Sequelize.TEXT,
  valid_from: Sequelize.DATEONLY,
  valid_to: Sequelize.DATEONLY,
  description: Sequelize.TEXT,
  timezone: { type: Sequelize.TEXT, defaultValue: 'America/New_York' },
});

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const toAdd = columns(Sequelize);
      // eslint-disable-next-line no-restricted-syntax
      for (const name of Object.keys(toAdd)) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn('holiday_schedules', name, toAdd[name], { transaction });
      }
      await queryInterface.sequelize.query(
        `ALTER TABLE holiday_schedules
           ADD CONSTRAINT holiday_schedules_freq_check CHECK (freq IN ('WEEKLY', 'MONTHLY'))`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        'UPDATE holiday_schedules SET valid_from = start_date, valid_to = end_date',
        { transaction },
      );
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // eslint-disable-next-line no-restricted-syntax
      for (const name of Object.keys(columns(Sequelize))) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn('holiday_schedules', name, { transaction });
      }
    });
  },
};
