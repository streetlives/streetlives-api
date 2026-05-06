/**
 * @jest-environment node
 */

import models from '../../src/models';
import geometry from '../../src/utils/geometry';

describe('Location.findCatalog', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('paginates location ids before hydrating physical addresses', async () => {
    jest.spyOn(models.Location, 'count').mockResolvedValue(2);
    const findAllSpy = jest.spyOn(models.Location, 'findAll')
      .mockResolvedValueOnce([
        { id: 'location-1' },
        { id: 'location-2' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'location-2',
          PhysicalAddresses: [{ id: 'addr-2' }],
        },
        {
          id: 'location-1',
          PhysicalAddresses: [{ id: 'addr-1a' }, { id: 'addr-1b' }],
        },
      ]);

    const result = await models.Location.findCatalog({
      position: geometry.createPoint(-73.981452, 40.763765),
      radius: 20000,
      limit: 2,
      offset: 0,
    });

    const firstQuery = findAllSpy.mock.calls[0][0];
    const secondQuery = findAllSpy.mock.calls[1][0];
    const idFilterSymbols = Object.getOwnPropertySymbols(secondQuery.where.id);

    expect(firstQuery).toEqual(expect.objectContaining({
      attributes: ['id'],
      limit: 2,
      offset: 0,
      raw: true,
    }));
    expect(firstQuery.include).toBeUndefined();
    expect(secondQuery.limit).toBeUndefined();
    expect(secondQuery.offset).toBeUndefined();
    expect(secondQuery.include).toEqual(expect.any(Array));
    expect(secondQuery.where.id[idFilterSymbols[0]]).toEqual(['location-1', 'location-2']);
    expect(result.totalNumLocations).toBe(2);
    expect(result.locations.map(location => location.id)).toEqual(['location-1', 'location-2']);
    expect(result.locations[0].PhysicalAddresses).toHaveLength(2);
  });
});
