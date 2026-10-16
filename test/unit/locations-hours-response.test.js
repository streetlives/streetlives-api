/** @jest-environment node */
import locations from '../../src/controllers/locations';
import models from '../../src/models';

describe('simplified location hours availability', () => {
  afterAll(async () => {
    await models.sequelize.close();
  });

  it('tracks published service hours while omitting the full service payload', async () => {
    const search = jest.spyOn(models.Location, 'search');
    try {
      for (const [services, expected] of [
        [[], false],
        [[{ HolidaySchedules: [{ opens_at: null, closes_at: null }] }], false],
        [[{ HolidaySchedules: [{ opens_at: null, closes_at: '17:00:00' }] }], true],
        [[{ HolidaySchedules: [{ opens_at: '09:00:00', closes_at: null }] }], true],
        [[{ HolidaySchedules: [{ closed: true, opens_at: null, closes_at: null }] }], true],
        [[{ HolidaySchedules: [{ opens_at: '00:00:00', closes_at: '23:59:00' }] }], true],
        [[{
          HolidaySchedules: [{
            closed: true, opens_at: '09:00:00', closes_at: '17:00:00',
          }],
        }], true],
        [[{
          HolidaySchedules: [
            { closed: true, opens_at: '09:00:00', closes_at: '17:00:00' },
            { closed: false, opens_at: '00:00:00', closes_at: '23:59:00' },
          ],
        }], true],
        [[{ HolidaySchedules: [] }], false],
      ]) {
        search.mockResolvedValue({
          locations: [{ get: () => ({ id: 'location-id', Services: services }) }],
          totalNumLocations: 1,
        });
        const response = { send: jest.fn(), setHeader: jest.fn() };
        const next = jest.fn();
        await locations.find({ query: { locationFieldsOnly: true } }, response, next);
        expect(next).not.toHaveBeenCalled();
        expect(response.send).toHaveBeenCalledWith([{
          id: 'location-id', closed: false, has_service_hours: expected,
        }]);
      }
    } finally {
      search.mockRestore();
    }
  });
});
