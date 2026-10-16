import hasServiceHours from '../../src/utils/service-hours';

describe('hasServiceHours', () => {
  it('rejects missing services and entirely unknown service hours', () => {
    [undefined, null, [], [{}], [{ HolidaySchedules: null }], [
      { RegularSchedules: [{ opens_at: '09:00:00', closes_at: '17:00:00' }] },
    ], [{
      HolidaySchedules: [
        { opens_at: null, closes_at: null },
        { closed: null, opens_at: null, closes_at: null },
        { closed: false, opens_at: null, closes_at: null },
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

  it('keeps closed schedules eligible even when time values are null', () => {
    expect(hasServiceHours([{
      HolidaySchedules: [{ closed: true, opens_at: '09:00:00', closes_at: '17:00:00' }],
    }])).toBe(true);
    expect(hasServiceHours([{
      HolidaySchedules: [{ closed: true, opens_at: null, closes_at: null }],
    }])).toBe(true);
  });

  it('accepts either recorded time without requiring a complete pair', () => {
    for (const times of [
      { opens_at: '09:00:00', closes_at: null },
      { opens_at: null, closes_at: '17:00:00' },
    ]) {
      expect(hasServiceHours([{ HolidaySchedules: [times] }])).toBe(true);
    }
  });

  it('accepts displayable hours alongside closed schedules', () => {
    expect(hasServiceHours([{
      HolidaySchedules: [{ closed: true, opens_at: '09:00:00', closes_at: '17:00:00' }],
    }, {
      HolidaySchedules: [{ closed: false, opens_at: '00:00:00', closes_at: '23:59:00' }],
    }])).toBe(true);
  });
});
