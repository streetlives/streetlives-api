import createLocationModel from '../../src/models/location';

describe('Location.search', () => {
  function createModel() {
    const Location = {};
    const sequelize = {
      define: jest.fn(() => Location),
      literal: jest.fn(value => value),
      models: {
        EventRelatedInfo: {},
        HolidaySchedule: {},
        Organization: {},
        Service: {},
      },
    };

    createLocationModel(sequelize, {}, {});
    return Location;
  }

  it('threads noServices through non-radius organization searches', async () => {
    const Location = createModel();
    const filterParameters = { organizationName: 'Housing Works' };

    Location.findUniqueLocationIds = jest.fn()
      .mockResolvedValueOnce(['location-1'])
      .mockResolvedValueOnce([]);

    await Location.search({
      filterParameters,
      noServices: true,
    });

    expect(Location.findUniqueLocationIds).toHaveBeenCalledTimes(2);
    expect(Location.findUniqueLocationIds.mock.calls.map(call => call[4]))
      .toEqual([true, true]);
  });
});
