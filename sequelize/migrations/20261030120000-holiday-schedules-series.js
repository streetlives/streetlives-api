// Turns holiday_schedules rows into Google Calendar-style series (see the README):
// - exdates lists the dates a series skips ("delete this occurrence");
// - bymonth (RFC 5545 BYMONTH) limits a rule to some months, and lets FREQ=YEARLY rows name
//   a date or a weekday in a month: "every December 25", "every 4th Thursday of November";
// - every open row with only a weekday (no freq, no dates) is a weekly series, as readers
//   already took it. Dated weekday rows are left alone: readers take them as that weekday every
//   week between the dates, as before.
// HSDS has neither exdates nor bymonth.
const RECURRENCE_CHECK = 'holiday_schedules_recurrence_check';
const FREQ_CHECK = 'holiday_schedules_freq_check';
const YEARLY_CHECK = 'holiday_schedules_yearly_check';

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      await queryInterface.addColumn(
        'holiday_schedules',
        'exdates',
        Sequelize.ARRAY(Sequelize.DATEONLY),
        { transaction },
      );
      await queryInterface.addColumn(
        'holiday_schedules',
        'bymonth',
        Sequelize.TEXT,
        { transaction },
      );

      await query(`ALTER TABLE holiday_schedules DROP CONSTRAINT IF EXISTS ${FREQ_CHECK}`);
      await query(`ALTER TABLE holiday_schedules DROP CONSTRAINT IF EXISTS ${RECURRENCE_CHECK}`);
      await query(`ALTER TABLE holiday_schedules
        ADD CONSTRAINT ${FREQ_CHECK} CHECK (freq IN ('WEEKLY', 'MONTHLY', 'YEARLY'))`);
      // RFC 5545: a numbered BYDAY ("2FR") and BYMONTHDAY only apply within a month or year.
      await query(`ALTER TABLE holiday_schedules ADD CONSTRAINT ${RECURRENCE_CHECK} CHECK (
        COALESCE(freq, '') IN ('MONTHLY', 'YEARLY')
        OR ((byday IS NULL OR byday !~ '[0-9]') AND bymonthday IS NULL))`);
      // A yearly row names its months, so "4TH" is the 4th Thursday of the month.
      await query(`ALTER TABLE holiday_schedules ADD CONSTRAINT ${YEARLY_CHECK} CHECK (
        freq IS DISTINCT FROM 'YEARLY' OR bymonth IS NOT NULL)`);

      // Weekday 0 is a legacy Sunday.
      await query(`UPDATE holiday_schedules
           SET freq = 'WEEKLY',
               byday = COALESCE(
                 byday,
                 (ARRAY['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[weekday + 1]
               )
           WHERE freq IS NULL AND weekday IS NOT NULL AND NOT closed
             AND valid_from IS NULL AND valid_to IS NULL`);
    });
  },

  // The backfilled freq/byday stay: they say what the rows already meant. Yearly rows (closures
  // that repeat every year) can't be kept, as the restored constraints only allow WEEKLY and
  // MONTHLY, so they go; skipped dates and month limits go with their columns.
  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      await query("DELETE FROM holiday_schedules WHERE freq = 'YEARLY'");
      await query(`ALTER TABLE holiday_schedules DROP CONSTRAINT IF EXISTS ${YEARLY_CHECK}`);
      await query(`ALTER TABLE holiday_schedules DROP CONSTRAINT IF EXISTS ${FREQ_CHECK}`);
      await query(`ALTER TABLE holiday_schedules DROP CONSTRAINT IF EXISTS ${RECURRENCE_CHECK}`);
      await query(`ALTER TABLE holiday_schedules
        ADD CONSTRAINT ${FREQ_CHECK} CHECK (freq IN ('WEEKLY', 'MONTHLY'))`);
      await query(`ALTER TABLE holiday_schedules ADD CONSTRAINT ${RECURRENCE_CHECK} CHECK (
        COALESCE(freq, '') = 'MONTHLY'
        OR ((byday IS NULL OR byday !~ '[0-9]') AND bymonthday IS NULL))`);
      await queryInterface.removeColumn('holiday_schedules', 'bymonth', { transaction });
      await queryInterface.removeColumn('holiday_schedules', 'exdates', { transaction });
    });
  },
};
