import request from 'supertest';
import app from '../../src';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';

describe('find locations', () => {
  const originLongitude = -73.981452;
  const originLatitude = 40.763765;
  const radius = 2000;
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);
  const pointFarFromOrigin = geometry.createPoint(-73.951042, 40.718576);

  let primaryLocation;
  let otherServiceLocation;
  let hiddenLocation;

  const setupData = () => models.Organization.create({
    name: 'The Test Org',
    description: 'An organization meant for testing purposes.',
  })
    .then((organization) => {
      const baseLocationData = {
        organization_id: organization.id,
        Services: [{
          organization_id: organization.id,
          name: 'A specific offering',
          Taxonomies: [{
            name: 'Shelter',
          }],
        }],
      };
      const associationParams = {
        include: [{
          model: models.Service,
          include: [{ model: models.Taxonomy }],
        }],
      };

      return Promise.all([
        models.Location.create(
          { ...baseLocationData, name: 'Nearby center', position: pointNearOrigin },
          associationParams,
        ),
        models.Location.create(
          {
            ...baseLocationData,
            name: 'Nearby center (volunteers)',
            position: pointNearOrigin,
            hidden_from_search: true,
          },
          associationParams,
        ),
        models.Location.create(
          {
            ...baseLocationData,
            name: 'Other nearby center',
            position: pointNearOrigin,
            Services: [{
              organization_id: organization.id,
              name: 'A different kind of service',
              Taxonomies: [{
                name: 'Food',
              }],
            }],
          },
          associationParams,
        ),
        models.Location.create(
          { ...baseLocationData, name: 'Far-off center', position: pointFarFromOrigin },
          associationParams,
        ),
      ]);
    })
    .then(([firstNewLocation, secondNewLocation, thirdNewLocation]) => {
      primaryLocation = firstNewLocation;
      hiddenLocation = secondNewLocation;
      otherServiceLocation = thirdNewLocation;
    });

  const expectMatchNearbyLocations = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toHaveLength(2);
    expect(returnedLocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: primaryLocation.name }),
      expect.objectContaining({ name: otherServiceLocation.name }),
    ]));
  };

  const expectMatchPrimaryLocation = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toHaveLength(1);
    expect(returnedLocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: primaryLocation.name }),
    ]));
  };

  const expectNoMatchingLocations = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toEqual([]);
  };

  beforeAll(() => models.sequelize.sync({ force: true }).then(setupData));
  afterAll(() => {
    models.sequelize.close();
    app.server.close();
  });

  it('should return locations within a given radius of a given position', () =>
    request(app)
      .get('/locations')
      .query({
        latitude: originLatitude,
        longitude: originLongitude,
        radius,
      })
      .expect(200)
      .then(expectMatchNearbyLocations));

  it('should not return locations marked "hidden from search" (meant for comments only)', () =>
    request(app)
      .get('/locations')
      .query({
        latitude: originLatitude,
        longitude: originLongitude,
        radius,
      })
      .expect(200)
      .then((res) => {
        expect(res.body).not.toContainEqual(expect.objectContaining({ name: hiddenLocation.name }));
      }));

  it('should return an empty array if no matching locations are found', () =>
    request(app)
      .get('/locations')
      .query({
        latitude: originLatitude,
        longitude: originLongitude,
        radius: 1,
      })
      .expect(200)
      .then(expectNoMatchingLocations));

  it('should return a 400 status code if not passed a position', () =>
    request(app)
      .get('/locations')
      .expect(400));

  describe('when taxonomy ID is specified', () => {
    it('should return locations that match the taxonomy ID', () => {
      const matchingId = primaryLocation.Services[0].Taxonomies[0].id;

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: matchingId,
        })
        .expect(200)
        .then(expectMatchPrimaryLocation);
    });

    it('should not return locations that don\'t match the taxonomy ID', () => {
      const nonMatchingId = '11111111-1111-1111-1111-111111111111';

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: nonMatchingId,
        })
        .expect(200)
        .then(expectNoMatchingLocations);
    });

    it('should return locations under multiple taxonomies when multiple IDs are passed', () => {
      const matchingId1 = primaryLocation.Services[0].Taxonomies[0].id;
      const matchingId2 = otherServiceLocation.Services[0].Taxonomies[0].id;

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: `${matchingId1},${matchingId2}`,
        })
        .expect(200)
        .then(expectMatchNearbyLocations);
    });
  });

  describe('when a search string is specified', () => {
    const makeRequestWithSearchString = searchString =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          searchString,
        });

    it('should match locations whose organization has the given string in its name', () =>
      makeRequestWithSearchString('test org')
        .expect(200)
        .then(expectMatchNearbyLocations));

    it('should match locations whose organization has the given string in its description', () =>
      makeRequestWithSearchString('testing purpose')
        .expect(200)
        .then(expectMatchNearbyLocations));

    it('should match locations which belong to a taxonomy containing the given string', () =>
      makeRequestWithSearchString('shelter')
        .expect(200)
        .then(expectMatchPrimaryLocation));

    it('should match locations that provide a service with the given string in its name', () =>
      makeRequestWithSearchString('offering')
        .expect(200)
        .then(expectMatchPrimaryLocation));

    it('should not match if none of the relevant fields include the given string', () =>
      makeRequestWithSearchString('not matching')
        .expect(200)
        .then(expectNoMatchingLocations));

    it('should not match locations that have the given string in their name', () =>
      makeRequestWithSearchString('center')
        .expect(200)
        .then(expectNoMatchingLocations));
  });
});
