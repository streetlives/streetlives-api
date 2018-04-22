import request from 'supertest';
import app from '../../src';
import models from '../../src/models';

describe('get location info', () => {
  let location;

  const setupData = () => models.Organization.create({
    name: 'The Test Org',
    description: 'An organization meant for testing purposes.',
    url: 'www.streetlives.com',
  })
    .then(organization => models.Location.create({
      organization_id: organization.id,
      name: 'Some kind of center',
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
      Services: [{
        organization_id: organization.id,
        name: 'A specific offering',
        Taxonomies: [{
          name: 'Shelter',
        }],
      }],
      Comments: [{
        content: 'Test comment',
        posted_by: 'Test poster',
      }],
    }, {
      include: [
        { model: models.PhysicalAddress },
        { model: models.Phone },
        { model: models.Comment },
        { model: models.Service, include: [{ model: models.Taxonomy }] },
      ],
    }))
    .then((newLocation) => {
      location = newLocation;
    });

  beforeAll(() => models.sequelize.sync({ force: true }).then(setupData));
  afterAll(() => {
    models.sequelize.close();
    app.server.close();
  });

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
