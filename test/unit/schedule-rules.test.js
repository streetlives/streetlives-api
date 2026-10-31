import { isOpenAt } from '../../src/utils/schedule-rules';
import assertNoScheduleConflicts from '../../src/services/schedule-conflicts';

const { cases } = require('../fixtures/schedule-cases.json');

// The cases the openAt search, gogetta and yourpeer.nyc are tested against too.
describe('schedule cases', () => {
  cases.forEach(({ name, rows, checks }) => {
    it(name, () => {
      checks.forEach(({ at, open }) => {
        const [date, time] = at.split('T');
        const [hours, minutes] = time.split(':').map(Number);
        expect({ at, open: isOpenAt(rows, date, (hours * 60) + minutes) }).toEqual({ at, open });
      });
    });
  });
});

describe('assertNoScheduleConflicts', () => {
  const today = '2026-11-01';
  const saturday = {
    occasion: 'COVID19',
    closed: false,
    weekday: 'Saturday',
    freq: 'WEEKLY',
    byday: 'SA',
    opensAt: '09:00',
    closesAt: '13:00',
  };
  const check = hours => () => assertNoScheduleConflicts(hours, today);

  it('accepts a lunch break', () => {
    expect(check([saturday, { ...saturday, opensAt: '14:00', closesAt: '17:00' }]))
      .not.toThrow();
  });

  it('refuses ranges that touch, which should be one range', () => {
    expect(check([saturday, { ...saturday, opensAt: '13:00', closesAt: '17:00' }]))
      .toThrow('SA 09:00-13:00 and SA 13:00-17:00 touch (make them one range) on 2026-11-07'
        + ' and 51 more dates');
  });

  it('refuses a monthly range overlapping a weekly one', () => {
    expect(check([saturday, {
      ...saturday, freq: 'MONTHLY', byday: '1SA', opensAt: '12:00', closesAt: '15:00',
    }])).toThrow('overlap on 2026-11-07');
  });

  it('refuses a date that is both closed and open', () => {
    expect(check([
      {
        occasion: 'COVID19', closed: true, validFrom: '2026-12-24', validTo: '2026-12-26',
      },
      {
        occasion: 'COVID19',
        closed: false,
        validFrom: '2026-12-25',
        opensAt: '10:00',
        closesAt: '14:00',
      },
    ])).toThrow('2026-12-25 is both closed and open');
  });

  it('refuses ranges that touch at midnight, which should be one overnight range', () => {
    expect(check([
      { ...saturday, opensAt: '22:00', closesAt: '00:00' },
      {
        ...saturday, weekday: 'Sunday', byday: 'SU', opensAt: '00:00', closesAt: '06:00',
      },
    ])).toThrow('SA 22:00-00:00 and SU 00:00-06:00 touch (make them one range)');
  });

  it('accepts whole days one after another', () => {
    const allDay = ['Monday', 'Tuesday'].map(weekday => ({
      ...saturday,
      weekday,
      byday: weekday.slice(0, 2).toUpperCase(),
      opensAt: '00:00',
      closesAt: '00:00',
    }));
    expect(check(allDay)).not.toThrow();
  });

  it('accepts overnight hours split at midnight the old way', () => {
    expect(check([
      { ...saturday, opensAt: '21:00', closesAt: '23:59' },
      {
        ...saturday, weekday: 'Sunday', byday: 'SU', opensAt: '00:00', closesAt: '06:00',
      },
    ])).not.toThrow();
  });

  it('checks each occasion on its own', () => {
    expect(check([saturday, { ...saturday, occasion: 'CLOSURE', opensAt: '12:00' }]))
      .not.toThrow();
  });
});
