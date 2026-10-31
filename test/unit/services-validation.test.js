import Joi from 'joi';
import serviceSchemas from '../../src/controllers/validation/services';

const validate = irregularHours => Joi.validate(
  {
    params: { serviceId: '00000000-0000-0000-0000-000000000001' },
    body: { irregularHours: irregularHours.map(row => ({ occasion: 'COVID19', ...row })) },
  },
  serviceSchemas.update,
  { allowUnknown: true },
);

const saturdays = {
  closed: false,
  opensAt: '09:00',
  closesAt: '17:00',
  freq: 'WEEKLY',
  weekday: 'Saturday',
  byday: 'SA',
};

describe('irregularHours validation', () => {
  it('accepts what the gogetta hours editor saves', async () => {
    await expect(validate([
      { ...saturdays, validTo: '2026-11-30', exdates: ['2026-11-14'] },
      {
        ...saturdays, validFrom: '2026-12-01', opensAt: '10:00', closesAt: '14:00',
      },
      {
        ...saturdays, freq: 'MONTHLY', byday: '1SA,3SA', opensAt: '18:00', closesAt: '20:00',
      },
      {
        ...saturdays, weekday: 'Sunday', byday: 'SU', interval: 2, validFrom: '2021-10-31',
      },
      {
        ...saturdays, weekday: 'Friday', byday: 'FR', opensAt: '22:00', closesAt: '02:00',
      },
      {
        closed: false, opensAt: '09:00', closesAt: '17:00', freq: 'MONTHLY', bymonthday: '15',
      },
      {
        closed: true, validFrom: '2026-11-26', validTo: '2026-11-26', description: 'Thanksgiving',
      },
    ])).resolves.toBeDefined();
  });

  it('accepts closures that repeat every year or month', async () => {
    await expect(validate([
      ...['Monday', 'Tuesday'].map(weekday => ({
        ...saturdays, weekday, byday: weekday.slice(0, 2).toUpperCase(),
      })),
      {
        closed: true, freq: 'YEARLY', bymonth: '12', bymonthday: '25', description: 'Christmas',
      },
      {
        closed: true, freq: 'YEARLY', bymonth: '11', byday: '4TH',
      },
      { closed: true, freq: 'MONTHLY', byday: '-1FR' },
      { ...saturdays, bymonth: '6,7,8' },
    ])).resolves.toBeDefined();
  });

  it('refuses a yearly row without its months, and months on a one-off', async () => {
    await expect(validate([{ closed: true, freq: 'YEARLY', bymonthday: '25' }])).rejects.toThrow();
    await expect(validate([{ closed: true, validFrom: '2026-12-25', bymonth: '12' }]))
      .rejects.toThrow();
  });

  it('accepts a series that stops on a date without a start date', async () => {
    await expect(validate([{ ...saturdays, validTo: '2026-11-30' }])).resolves.toBeDefined();
  });

  it('refuses an end date before the start date', async () => {
    await expect(validate([{ ...saturdays, validFrom: '2026-12-01', validTo: '2026-11-30' }]))
      .rejects.toThrow();
  });

  it('refuses an interval without a start date to count from', async () => {
    await expect(validate([{ ...saturdays, interval: 2 }])).rejects.toThrow();
  });

  it('only lets a series skip dates', async () => {
    await expect(validate([{ closed: true, validFrom: '2026-11-26', exdates: ['2026-11-26'] }]))
      .rejects.toThrow();
  });

  it('still accepts weekday rows from before freq existed', async () => {
    await expect(validate([{
      closed: false, opensAt: '09:00', closesAt: '17:00', weekday: 'Monday',
    }])).resolves.toBeDefined();
  });
});

describe('numbered BYDAY and BYMONTHDAY without a freq', () => {
  it('are refused, as they need a month to count in', async () => {
    const friday = {
      weekday: 'Friday', opensAt: '09:00', closesAt: '17:00', closed: false,
    };
    await expect(validate([{ ...friday, byday: 'MO,2FR' }])).rejects.toThrow();
    await expect(validate([{ ...friday, bymonthday: '15' }])).rejects.toThrow();
  });
});
