const migration = require('../../sequelize/migrations/20261030120000-holiday-schedules-series');

// Runs `step` with a queryInterface that records the SQL it runs.
async function run(step) {
  const queries = [];
  const queryInterface = {
    addColumn: jest.fn(() => Promise.resolve()),
    removeColumn: jest.fn(() => Promise.resolve()),
    sequelize: {
      transaction: callback => callback('transaction'),
      query: jest.fn((sql) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        return Promise.resolve();
      }),
    },
  };
  await migration.default[step](queryInterface, {
    ARRAY: type => `ARRAY(${type})`, DATEONLY: 'DATEONLY', TEXT: 'TEXT',
  });
  return { queries, queryInterface };
}

describe('holiday-schedules-series migration', () => {
  it('only makes weekly series of open weekday rows without dates', async () => {
    const { queries } = await run('up');
    const backfill = queries.find(sql => sql.startsWith('UPDATE holiday_schedules'));

    const onlyUndatedOpenWeekdays = 'WHERE freq IS NULL AND weekday IS NOT NULL AND NOT closed'
      + ' AND valid_from IS NULL AND valid_to IS NULL';
    expect(backfill).toContain(onlyUndatedOpenWeekdays);
  });

  it('removes yearly rows before restoring the old freq constraint on the way down', async () => {
    const { queries, queryInterface } = await run('down');
    const deleteYearly = queries.indexOf("DELETE FROM holiday_schedules WHERE freq = 'YEARLY'");
    const restoreFreqCheck = queries
      .findIndex(sql => sql.includes("CHECK (freq IN ('WEEKLY', 'MONTHLY'))"));

    expect(deleteYearly).toBeGreaterThanOrEqual(0);
    expect(deleteYearly).toBeLessThan(restoreFreqCheck);
    expect(queryInterface.removeColumn.mock.calls.map(([, column]) => column))
      .toEqual(['bymonth', 'exdates']);
  });
});
