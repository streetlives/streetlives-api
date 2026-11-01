/**
 * @jest-environment node
 */

import models from '../../src/models';

const migration = require('../../sequelize/migrations/20261030120000-holiday-schedules-series');

// Runs the migration as sequelize-cli does, on the holiday_schedules table test/setup.js builds
// from the models (so as up leaves it) for each test file.
const { sequelize, Sequelize } = models;
const queryInterface = sequelize.getQueryInterface();
const BACKUP = 'holiday_schedules_series_backup';

const select = sql => sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT });
const rows = () => select('SELECT * FROM holiday_schedules ORDER BY id');
const columnsOf = async table => (await select(`SELECT column_name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = '${table}'`))
  .map(({ column_name: column }) => column);

const id = n => `00000000-0000-0000-0000-00000000000${n}`;
const insert = values => sequelize.query(`INSERT INTO holiday_schedules
  (id, closed, opens_at, closes_at, weekday, freq, byday, bymonthday, bymonth, exdates,
    description, created_at, updated_at)
  VALUES ${values.map(row => `(${row}, now(), now())`).join(', ')}`);

describe('holiday-schedules-series migration on Postgres', () => {
  it('runs up, down and up again without losing a schedule', async () => {
    // Back to how the previous migration left the table, with a weekday row from before freq.
    await migration.default.down(queryInterface, Sequelize);
    expect(await columnsOf('holiday_schedules')).not.toContain('exdates');
    // Its backup is empty; a database that never rolled back has none at all.
    await sequelize.query(`DROP TABLE ${BACKUP}`);
    await sequelize.query(`INSERT INTO holiday_schedules
      (id, closed, opens_at, closes_at, weekday, created_at, updated_at)
      VALUES ('${id(1)}', false, '09:00', '17:00', 6, now(), now())`);

    await migration.default.up(queryInterface, Sequelize);
    expect(await rows()).toEqual([
      expect.objectContaining({ id: id(1), freq: 'WEEKLY', byday: 'SA' }),
    ]);
    expect(await columnsOf(BACKUP)).toEqual([]);

    await insert([
      `'${id(2)}', true, null, null, null, 'YEARLY', null, '25', '12', null, 'Christmas Day'`,
      `'${id(3)}', true, null, null, null, 'YEARLY', '4TH', null, '11', null, 'Thanksgiving'`,
      `'${id(4)}', false, '10:00', '14:00', 6, 'WEEKLY', 'SA', null, null,
        ARRAY['2026-11-14']::date[], null`,
      `'${id(5)}', false, '09:00', '12:00', null, 'MONTHLY', null, '15', '6,7,8', null, null`,
    ]);
    const before = await rows();

    await migration.default.down(queryInterface, Sequelize);
    expect((await rows()).map(row => row.id)).toEqual([id(1), id(4), id(5)]);
    expect((await select(`SELECT id FROM ${BACKUP} ORDER BY id`)).map(row => row.id))
      .toEqual([id(2), id(3), id(4), id(5)]);
    expect(await columnsOf('holiday_schedules')).not.toContain('bymonth');

    await migration.default.up(queryInterface, Sequelize);
    expect(await rows()).toEqual(before);
    expect(await columnsOf(BACKUP)).toEqual([]);
  }, 30000);
});
