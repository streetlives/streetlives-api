/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('get location info', () => {
  let location;

  const setupData = () => models.Organization.create({
    name: 'The Test Org',
    description: 'An organization meant for testing purposes.',
    url: 'www.streetlives.com',
    Services: [{
      name: 'A specific offering',
      additional_info: 'A service might have some other info as well.',
      Taxonomies: [{
        name: 'Shelter',
      }],
    }],
    Locations: [
      {
        name: 'Some kind of center',
        description: 'This is how one would describe this shelter.',
        additional_info: 'And some other, perhaps less standardized, information.',
        hidden_from_search: true,
        PhysicalAddresses: [{
          address_1: '123 West 30th Street',
          city: 'New York',
          state_province: 'NY',
          postal_code: '10001',
          country: 'United States',
        }],
        Phones: [{
          number: '212.121.0123',
        }],
        Comments: [{
          content: 'Test comment',
          posted_by: 'Test poster',
        }],
      }
    ]
  },
  {
    include: [
      { model: models.Service, include: [{ model: models.Taxonomy }] },
      { model: models.Location, include: [
        { model: models.PhysicalAddress },
        { model: models.Phone },
        { model: models.Comment },
      ] },
    ],
  }).then(organization => {
    location = organization.Locations[0];
    return location.setServices(organization.Services);
  });

  beforeAll(setupData);

  const stripTimestampsAndIds = obj => Object.keys(obj).reduce((currStrippedObj, key) => {
    const value = obj[key];

    if (key === 'id' || key.includes('_id') || key.includes('_at')) {
      return currStrippedObj;
    }

    if (value && typeof value === 'object') {
      return { ...currStrippedObj, [key]: stripTimestampsAndIds(value) };
    }
    return { ...currStrippedObj, [key]: value };
  }, {});

  it('should get all relevant fields for a given location', () =>
    request(app)
      .get(`/locations/${location.id}`)
      .expect(200)
      .then((res) => {
        const strippedFields = stripTimestampsAndIds(res.body);
        expect(strippedFields).toMatchSnapshot();
      }));

  it('should return a 404 status code when the given location ID isn\'t found', () => {
    const nonExistentLocationId = '11111111-1111-1111-1111-111111111111';

    return request(app)
      .get(`/locations/${nonExistentLocationId}`)
      .expect(404);
  });
});
