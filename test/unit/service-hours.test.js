import hasServiceHours from '../../src/utils/service-hours';

describe('hasServiceHours', () => {
  it('rejects missing services and services without displayable hours', () => {
    [undefined, null, [], [{}], [{ HolidaySchedules: null }], [
      { RegularSchedules: [{ opens_at: '09:00:00', closes_at: '17:00:00' }] },
    ], [{
      HolidaySchedules: [
        { opens_at: null, closes_at: null },
        { opens_at: '09:00:00', closes_at: null },
        { opens_at: null, closes_at: '17:00:00' },
        { opens_at: '', closes_at: '17:00:00' },
      ],
    }]].forEach(services => expect(hasServiceHours(services)).toBe(false));
  });

  it('accepts a complete pair on any service, including midnight', () => {
    expect(hasServiceHours([
      { HolidaySchedules: [] },
      { HolidaySchedules: [{ opens_at: '00:00:00', closes_at: '23:59:00' }] },
    ])).toBe(true);
  });

  it('does not require a service to be open at the current time', () => {
    expect(hasServiceHours([{
      HolidaySchedules: [{ weekday: 1, opens_at: '09:00:00', closes_at: '10:00:00' }],
    }])).toBe(true);
  });
});
