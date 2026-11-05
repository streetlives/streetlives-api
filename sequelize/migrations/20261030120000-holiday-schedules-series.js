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
// Where a rollback keeps what the old schema can't hold, until up puts it back.
const BACKUP = 'holiday_schedules_series_backup';

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      const select = sql => queryInterface.sequelize.query(
        sql,
        { transaction, type: Sequelize.QueryTypes.SELECT },
      );
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

      // Puts back what a rollback set aside (see down): the yearly rows it removed, and the
      // skipped dates and month limits of the rows it kept.
      const backupQuery = `SELECT to_regclass('${BACKUP}') IS NOT NULL AS "backedUp"`;
      const [{ backedUp }] = await select(backupQuery);
      if (backedUp) {
        const [{ columns }] = await select(`SELECT
            string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) AS columns
          FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = '${BACKUP}'`);
        await query(`INSERT INTO holiday_schedules (${columns})
          SELECT ${columns} FROM ${BACKUP} WHERE freq = 'YEARLY'`);
        await query(`UPDATE holiday_schedules
             SET exdates = backup.exdates, bymonth = backup.bymonth
            FROM ${BACKUP} backup
           WHERE holiday_schedules.id = backup.id AND backup.freq IS DISTINCT FROM 'YEARLY'`);
        await query(`DROP TABLE ${BACKUP}`);
      }
    });
  },

  // The old schema can't hold yearly rows (closures that repeat every year: its constraints only
  // allow WEEKLY and MONTHLY), skipped dates or month limits, so the rows that have them are
  // copied to BACKUP before they go, and up puts them back. The backfilled freq/byday stay:
  // they say what the rows already meant.
  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const query = sql => queryInterface.sequelize.query(sql, { transaction });
      await query(`CREATE TABLE ${BACKUP} AS SELECT * FROM holiday_schedules
        WHERE freq = 'YEARLY' OR exdates IS NOT NULL OR bymonth IS NOT NULL`);
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
