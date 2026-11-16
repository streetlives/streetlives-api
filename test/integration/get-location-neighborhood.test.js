/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

// test/setup.js pins the global timeout to 10s, but its own beforeAll runs
// sequelize.sync plus three migrations, which exceeds that on a cold database.
jest.setTimeout(120000);

describe('location detail neighborhood lookup', () => {
  let location;
  let service;
  const borough = 'Neighborhood scalar regression';
  const polygon = (min, max) => ({
    type: 'Polygon',
    coordinates: [[[min, min], [max, min], [max, max], [min, max], [min, min]]],
  });

  beforeAll(async () => {
    const organization = await models.Organization.create({
      name: 'Neighborhood lookup test organization',
      Services: [{ name: 'Neighborhood lookup test service' }],
      Locations: [{
        name: 'Neighborhood lookup test location',
        position: { type: 'Point', coordinates: [1, 1] },
        PhysicalAddresses: [{
          address_1: '1 Test Street',
          city: 'Test City',
          state_province: 'NY',
          postal_code: '10001',
          country: 'United States',
        }],
      }],
    }, {
      include: [
        models.Service,
        { model: models.Location, include: [models.PhysicalAddress] },
      ],
    });
    [location] = organization.Locations;
    [service] = organization.Services;
    await location.setServices([service]);
    await location.reload();
  });

  afterEach(() => models.NycNeighborhoodGeometries.destroy({ where: { borough } }));

  describe.each([
    ['ID', () => `/locations/${location.id}`],
    ['slug', () => `/locations-by-slug/${location.slug}`],
  ])('lookup by %s', (lookup, path) => {
    it.each([
      ['no containing polygon', [], null],
      ['one containing polygon', ['Zulu'], 'Zulu'],
      ['overlapping polygons', ['Zulu', 'Alpha'], 'Alpha'],
      ['overlapping polygons inserted in reverse order', ['Alpha', 'Zulu'], 'Alpha'],
      ['duplicate neighborhood labels', ['Zulu', 'Zulu'], 'Zulu'],
    ])('returns complete detail with %s', async (description, labels, expected) => {
      await models.NycNeighborhoodGeometries.create({
        borough,
        neighborhood: 'Outside',
        geometry: polygon(3, 4),
      });
      for (const [index, neighborhood] of labels.entries()) {
        await models.NycNeighborhoodGeometries.create({
          borough,
          neighborhood,
          geometry: polygon(-index, 2 + index),
        });
      }

      const response = await request(app).get(path()).expect(200);

      expect(response.body.neighborhood).toBe(expected);
      expect(response.body.id).toBe(location.id);
      expect(response.body.address.street).toBe('1 Test Street');
      expect(response.body.Services).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: service.id, name: service.name }),
      ]));
    });
  });
});
