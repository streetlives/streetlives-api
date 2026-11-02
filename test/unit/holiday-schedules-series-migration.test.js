const migration = require('../../sequelize/migrations/20261030120000-holiday-schedules-series');

// Runs `step` with a queryInterface that records the SQL it runs. `backedUp` says whether a
// rollback left rows in the backup table.
async function run(step, { backedUp = false } = {}) {
  const queries = [];
  const queryInterface = {
    addColumn: jest.fn(() => Promise.resolve()),
    removeColumn: jest.fn(() => Promise.resolve()),
    sequelize: {
      transaction: callback => callback('transaction'),
      query: jest.fn((sql, { type } = {}) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        if (type !== 'SELECT') return Promise.resolve();
        return Promise.resolve(sql.includes('to_regclass')
          ? [{ backedUp }]
          : [{ columns: 'id, freq, exdates, bymonth' }]);
      }),
    },
  };
  await migration.default[step](queryInterface, {
    ARRAY: type => `ARRAY(${type})`,
    DATEONLY: 'DATEONLY',
    TEXT: 'TEXT',
    QueryTypes: { SELECT: 'SELECT' },
  });
  return { queries, queryInterface };
}

const BACKUP = 'holiday_schedules_series_backup';

describe('holiday-schedules-series migration', () => {
  it('only makes weekly series of open weekday rows without dates', async () => {
    const { queries } = await run('up');
    const backfill = queries.find(sql => sql.startsWith('UPDATE holiday_schedules'));

    const onlyUndatedOpenWeekdays = 'WHERE freq IS NULL AND weekday IS NOT NULL AND NOT closed'
      + ' AND valid_from IS NULL AND valid_to IS NULL';
    expect(backfill).toContain(onlyUndatedOpenWeekdays);
  });

  it('sets aside what the old schema cannot hold before removing it on the way down', async () => {
    const { queries, queryInterface } = await run('down');
    const backup = queries.indexOf(`CREATE TABLE ${BACKUP} AS SELECT * FROM holiday_schedules`
      + " WHERE freq = 'YEARLY' OR exdates IS NOT NULL OR bymonth IS NOT NULL");
    const deleteYearly = queries.indexOf("DELETE FROM holiday_schedules WHERE freq = 'YEARLY'");
    const restoreFreqCheck = queries
      .findIndex(sql => sql.includes("CHECK (freq IN ('WEEKLY', 'MONTHLY'))"));

    expect(backup).toBeGreaterThanOrEqual(0);
    expect(backup).toBeLessThan(deleteYearly);
    expect(deleteYearly).toBeLessThan(restoreFreqCheck);
    expect(queryInterface.removeColumn.mock.calls.map(([, column]) => column))
      .toEqual(['bymonth', 'exdates']);
  });

  it('puts back what a rollback set aside on the way up again', async () => {
    const { queries } = await run('up', { backedUp: true });
    const yearlyCheck = queries.findIndex(sql => sql.includes('holiday_schedules_yearly_check'
      + ' CHECK'));
    const restoreYearly = queries.indexOf('INSERT INTO holiday_schedules (id, freq, exdates,'
      + ` bymonth) SELECT id, freq, exdates, bymonth FROM ${BACKUP} WHERE freq = 'YEARLY'`);
    const restoreColumns = queries.findIndex(sql =>
      sql.startsWith('UPDATE holiday_schedules SET exdates = backup.exdates'));
    const dropBackup = queries.indexOf(`DROP TABLE ${BACKUP}`);

    expect(yearlyCheck).toBeGreaterThanOrEqual(0);
    expect(restoreYearly).toBeGreaterThan(yearlyCheck);
    expect(restoreColumns).toBeGreaterThan(restoreYearly);
    expect(dropBackup).toBeGreaterThan(restoreColumns);
  });

  it('leaves the rows alone on the way up when nothing was set aside', async () => {
    const { queries } = await run('up');

    expect(queries.some(sql => sql.includes(`FROM ${BACKUP}`))).toBe(false);
    expect(queries).not.toContain(`DROP TABLE ${BACKUP}`);
  });
});
