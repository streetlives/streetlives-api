/**
 * @jest-environment node
 */

import request from 'supertest';
import qs from 'qs';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';
import { documentTypes, eligibilityParams } from '../../src/services/services';

describe('find locations', () => {
  const originLongitude = -73.981452;
  const originLatitude = 40.763765;
  const radius = 2000;
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);
  const pointSlightlyFurtherFromOrigin = geometry.createPoint(-73.991304, 40.751907);
  const pointFarFromOrigin = geometry.createPoint(-73.951042, 40.718576);

  let organization;
  let primaryLocation;
  let otherServiceLocation;
  let hiddenLocation;
  let farLocation;

  let aSpecificOffering1;
  let aSpecificOffering2;
  let aDifferentKindOfService;
  let aSpecificOffering3;

  let lastValidatedAtStartTime;
  let lastValidatedAtEndTime;

  const clearData = async () => {
    await Promise.all([
      models.ServiceAtLocation.destroy({ where: {} }),
      models.ServiceTaxonomy.destroy({ where: {} }),
      models.PhysicalAddress.destroy({ where: {} }),
    ]);
    await Promise.all([
      models.Taxonomy.destroy({ where: {} }),
      models.Service.destroy({ where: {} }),
    ]);
    await models.Location.destroy({ where: {} });
    await models.Organization.destroy({ where: {} });
  };

  const setupData = async () => {
    await clearData();

    lastValidatedAtStartTime = new Date();
    organization = await models.Organization.create(
      {
        name: 'The Test Org',
        description: 'An organization meant for testing purposes.',
        Services: [
          {
            name: 'A specific offering',
            description: 'Only this service is described this way',
            Taxonomies: [{
              name: 'Shelter',
            }],
          },
          {
            name: 'A specific offering',
            description: 'Only this service is described this way',
            Taxonomies: [{
              name: 'Shelter',
            }],
          },
          {
            name: 'A different kind of service',
            Taxonomies: [{
              name: 'Food',
            }],
          },
          {
            name: 'A specific offering',
            description: 'Only this service is described this way',
            Taxonomies: [{
              name: 'Shelter',
            }],
          },
        ],
        Locations: [
          {
            name: 'Nearby center',
            position: pointNearOrigin,
            PhysicalAddresses: [{
              address_1: '123 W 50th St.',
              city: 'New York',
              state_province: 'NY',
              postal_code: '10001',
              country: 'US',
            }],
          },
          {
            name: 'Nearby center (volunteers)',
            position: pointNearOrigin,
            hidden_from_search: true,
            PhysicalAddresses: [{
              address_1: '222 E 75th St.',
              city: 'New York',
              state_province: 'NY',
              postal_code: '10002',
              country: 'US',
            }],
          },
          {
            name: 'Other nearby center',
            position: pointSlightlyFurtherFromOrigin,
          },
          { name: 'Far-off center', position: pointFarFromOrigin },
        ],
      },
      {
        include: [
          {
            model: models.Service,
            include: [{ model: models.Taxonomy }],
          },
          {
            model: models.Location,
            include: [
              models.PhysicalAddress,
            ],
          },
        ],
      },
    );
    lastValidatedAtEndTime = new Date();

    const locations = organization.Locations;
    [primaryLocation, hiddenLocation, otherServiceLocation, farLocation] = locations;

    [
      aSpecificOffering1,
      aSpecificOffering2,
      aDifferentKindOfService,
      aSpecificOffering3,
    ] = organization.Services;

    // link locations to services
    await primaryLocation.setServices([aSpecificOffering1]);
    await hiddenLocation.setServices([aSpecificOffering2]);
    await otherServiceLocation.setServices([aDifferentKindOfService]);
    await farLocation.setServices([aSpecificOffering3]);

    // this seems to be the best way to eager load thse guys
    [
      primaryLocation,
      hiddenLocation,
      otherServiceLocation,
      farLocation,
    ] = await Promise.all(locations.map(location => (
      models.Location.findByPk(location.id, {
        include: {
          model: models.Service,
          include: models.Taxonomy,
        },
      })
    )));
  };

  const checkLastValidatedAt = (returnedLocations) => {
    returnedLocations.forEach((location) => {
      const lastValidatedAt = new Date(location.last_validated_at).getTime();
      // add a little buffer (100ms), because this property gets added in an AFTER trigger
      expect(lastValidatedAt).toBeGreaterThan(lastValidatedAtStartTime.getTime() - 200);
      expect(lastValidatedAt).toBeLessThan(lastValidatedAtEndTime.getTime() + 200);
    });
  };

  const expectMatchNearbyLocations = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toHaveLength(2);
    expect(returnedLocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: primaryLocation.name }),
      expect.objectContaining({ name: otherServiceLocation.name }),
    ]));
    checkLastValidatedAt(returnedLocations);
  };

  const expectMatchPrimaryLocation = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toHaveLength(1);
    expect(returnedLocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: primaryLocation.name }),
    ]));
    checkLastValidatedAt(returnedLocations);
  };

  const expectNoMatchingLocations = (res) => {
    const returnedLocations = res.body;
    expect(returnedLocations).toEqual([]);
  };

  beforeEach(setupData);
  afterAll(clearData);

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

    it('should match locations which belong to a taxonomy containing the given string', () =>
      makeRequestWithSearchString('shelter')
        .expect(200)
        .then(expectMatchPrimaryLocation));

    it('should match locations providing a service with the given string in its name', () =>
      makeRequestWithSearchString('offering')
        .expect(200)
        .then(expectMatchPrimaryLocation));

    it('should match locations providing a service with the given string in its description', () =>
      makeRequestWithSearchString('service is described')
        .expect(200)
        .then(expectMatchPrimaryLocation));

    it('should not match if none of the relevant fields include the given string', () =>
      makeRequestWithSearchString('not matching')
        .expect(200)
        .then(expectNoMatchingLocations));

    it('should match locations that have the given string in their name', () =>
      makeRequestWithSearchString('center')
        .expect(200)
        .then(expectMatchNearbyLocations));
  });

  describe('when an organization name is specified', () => {
    it('should match locations whose organization has the given string in its name', () =>
      request(app).get('/locations').query({ organizationName: 'test org' })
        .expect(200)
        .then((res) => {
          const returnedLocations = res.body;
          expect(returnedLocations).toHaveLength(3);
          expect(returnedLocations).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: primaryLocation.name }),
            expect.objectContaining({ name: otherServiceLocation.name }),
            expect.objectContaining({ name: farLocation.name }),
          ]));
        }));

    it('should not match locations whose organization doesn\'t have the string in its name', () =>
      request(app).get('/locations').query({ organizationName: 'center' })
        .expect(200)
        .then(expectNoMatchingLocations));

    it('should return no more than max results, if specified', () =>
      request(app).get('/locations').query({ organizationName: 'test org', maxResults: 1 })
        .expect(200)
        .then((res) => {
          const returnedLocations = res.body;
          expect(returnedLocations).toHaveLength(1);
        }));
  });

  describe('when a minimum number of results is requested', () => {
    it('should return that many results even if some are outside the search radius', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          minResults: 3,
        })
        .expect(200)
        .then((res) => {
          const returnedLocations = res.body;
          expect(returnedLocations).toHaveLength(3);
          expect(returnedLocations).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: primaryLocation.name }),
            expect.objectContaining({ name: otherServiceLocation.name }),
            expect.objectContaining({ name: farLocation.name }),
          ]));
        }));

    it('should not return results outside the radius if sufficiently many are inside', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          minResults: 2,
        })
        .expect(200)
        .then(expectMatchNearbyLocations));

    it('should never return results that don\'t match the search string', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          searchString: 'shelter',
          minResults: 3,
        })
        .expect(200)
        .then((res) => {
          const returnedLocations = res.body;
          expect(returnedLocations).toHaveLength(2);
          expect(returnedLocations).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: primaryLocation.name }),
            expect.objectContaining({ name: farLocation.name }),
          ]));
        }));

    it('should never return results that don\'t match the taxonomy', () => {
      const matchingId = primaryLocation.Services[0].Taxonomies[0].id;

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: matchingId,
          minResults: 3,
        })
        .expect(200)
        .then((res) => {
          const returnedLocations = res.body;
          expect(returnedLocations).toHaveLength(1);
          expect(returnedLocations).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: primaryLocation.name }),
          ]));
        });
    });

    it('should return no fewer locations even when some match on multiple services', async () => {
      const matchingId = primaryLocation.Services[0].Taxonomies[0].id;

      const otherMatchingService = await organization.createService({
        name: 'Other matching service',
      });
      primaryLocation.setServices(primaryLocation.Services.concat(otherMatchingService));

      await models.ServiceTaxonomy.create({
        service_id: otherMatchingService.id,
        taxonomy_id: matchingId,
      });

      const res = await request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          minResults: 3,
        })
        .expect(200);

      const returnedLocations = res.body;
      expect(returnedLocations).toHaveLength(3);
      expect(returnedLocations).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: primaryLocation.name }),
        expect.objectContaining({ name: otherServiceLocation.name }),
        expect.objectContaining({ name: farLocation.name }),
      ]));
    });
  });

  describe('when a maximum number of results is specified', () => {
    it('should return the nearest results up to that number', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          searchString: 'shelter',
          maxResults: 1,
        })
        .expect(200)
        .then(expectMatchPrimaryLocation));
  });

  describe('when eligibility is specified', () => {
    let genderParam;
    let memberParam;
    let generalParam;

    let service1;
    let service2;

    beforeEach(async () => {
      await models.EligibilityParameter.destroy({ where: {} });
      await models.Eligibility.destroy({ where: {} });

      genderParam = await models.EligibilityParameter.create({ name: eligibilityParams.gender });
      memberParam =
        await models.EligibilityParameter.create({ name: eligibilityParams.membership });
      generalParam = await models.EligibilityParameter.create({ name: 'general' });

      [service1] = primaryLocation.Services;
      service2 = await organization.createService(
        {
          name: 'Second service',
          Taxonomies: [{
            name: 'Other category',
          }],
        },
        {
          include: [{ model: models.Taxonomy }],
        },
      );
      primaryLocation.setServices([service1, service2]);
    });

    afterAll(() => Promise.all([
      models.Eligibility.destroy({ where: {} }),
      models.EligibilityParameter.destroy({ where: {} }),
    ]));

    it('should filter out services with no eligibility (assumed to be unknown)', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          gender: 'female',
        })
        .then(expectNoMatchingLocations));

    it('should include services with no restriction on the given eligibility params', async () => {
      await service1.createEligibility({
        parameter_id: generalParam.id,
        eligible_values: ['everyone'],
      });

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          gender: 'female',
        })
        .then(expectMatchPrimaryLocation);
    });

    it('should filter out locations where no one service matches all conditions', async () => {
      await Promise.all([
        service1.createEligibility({ parameter_id: genderParam.id, eligible_values: ['male'] }),
        service1.createEligibility({ parameter_id: memberParam.id, eligible_values: ['true'] }),
        service2.createEligibility({ parameter_id: genderParam.id, eligible_values: ['female'] }),
      ]);

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          membership: false,
          gender: 'male',
        })
        .then(expectNoMatchingLocations);
    });

    it('should include locations with a service matching all the conditions', async () => {
      await Promise.all([
        service1.createEligibility({ parameter_id: genderParam.id, eligible_values: ['male'] }),
        service1.createEligibility({ parameter_id: memberParam.id, eligible_values: ['true'] }),
        service2.createEligibility({ parameter_id: genderParam.id, eligible_values: ['female'] }),
      ]);

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          membership: false,
          gender: 'female',
        })
        .then(expectMatchPrimaryLocation);
    });
  });

  describe('when taxonomy-specific attributes are specified', () => {
    let clothesPurposeAttribute;
    let clothesDemographicAttribute;

    let service1;
    let service2;

    beforeEach(async () => {
      await models.TaxonomySpecificAttribute.destroy({ where: {} });
      await models.ServiceTaxonomySpecificAttribute.destroy({ where: {} });

      clothesPurposeAttribute =
        await models.TaxonomySpecificAttribute.create({ name: 'clothesPurpose' });
      clothesDemographicAttribute =
        await models.TaxonomySpecificAttribute.create({ name: 'clothesDemographic' });

      [service1] = primaryLocation.Services;
      service2 = await organization.createService(
        {
          name: 'Second service',
          Taxonomies: [{
            name: 'Other category',
          }],
        },
        {
          include: [{ model: models.Taxonomy }],
        },
      );
      primaryLocation.setServices([service1, service2]);
    });

    afterAll(() => Promise.all([
      models.TaxonomySpecificAttribute.destroy({ where: {} }),
      models.ServiceTaxonomySpecificAttribute.destroy({ where: {} }),
    ]));

    it('should filter out services that don\'t have a given attribute at all', async () => {
      await service1.createServiceTaxonomySpecificAttribute({
        attribute_id: clothesPurposeAttribute.id,
        values: ['Work', 'Interview'],
      });

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomySpecificAttributes: [clothesDemographicAttribute.name, 'Kids'],
        })
        .then(expectNoMatchingLocations);
    });

    it('should filter out locations where no one service matches all attributes', async () => {
      await Promise.all([
        service1.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesPurposeAttribute.id, values: ['Work', 'Interview'],
        }),
        service1.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesDemographicAttribute.id, values: ['Kids'],
        }),
        service2.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesPurposeAttribute.id, values: ['Everyday'],
        }),
      ]);

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomySpecificAttributes: [
            clothesDemographicAttribute.name,
            'Kids',
            clothesPurposeAttribute.name,
            'Everyday',
          ],
        })
        .then(expectNoMatchingLocations);
    });

    it('should include locations with a service matching all the attributes', async () => {
      await Promise.all([
        service1.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesPurposeAttribute.id, values: ['Work', 'Interview'],
        }),
        service1.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesDemographicAttribute.id, values: ['Kids'],
        }),
        service2.createServiceTaxonomySpecificAttribute({
          attribute_id: clothesPurposeAttribute.id, values: ['Everyday'],
        }),
      ]);

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomySpecificAttributes: [
            clothesDemographicAttribute.name,
            'Kids',
            clothesPurposeAttribute.name,
            'Work',
          ],
        })
        .then(expectMatchPrimaryLocation);
    });

    it('should return a 400 status code when the attributes array is of odd length', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomySpecificAttributes: [
            clothesDemographicAttribute.name,
            'Kids',
            clothesPurposeAttribute.name,
          ],
        })
        .expect(400));
  });

  describe('when required documents are specified', () => {
    beforeEach(() => models.RequiredDocument.destroy({ where: {} }));
    afterAll(() => models.RequiredDocument.destroy({ where: {} }));

    it('should filter out services requiring documents not supposed to be required', async () => {
      await aSpecificOffering1.createRequiredDocument({
        document: documentTypes.referralLetter,
      });

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
          referralRequired: false,
        })
        .then(expectNoMatchingLocations);
    });

    it('should filter out services not requiring documents supposed to be required', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
          referralRequired: true,
        })
        .then(expectNoMatchingLocations));

    it('should include services with the right required and not required documents', async () => {
      await aSpecificOffering1.createRequiredDocument({
        document: documentTypes.photoId,
      });

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
          referralRequired: false,
          photoIdRequired: true,
        })
        .then(expectMatchPrimaryLocation);
    });
  });

  describe('when "open at" is specified', () => {
    const someSunday = '2019-06-09';
    const someSaturday = '2019-06-08';

    const timeZone = 'America/New_York';
    const someDate = new Date(someSunday);
    const timezoneOffset =
      someDate.getTime() - new Date(someDate.toLocaleString([], { timeZone })).getTime();
    const getDateFromNyTime = dateStr => new Date(new Date(dateStr).getTime() + timezoneOffset);

    beforeEach(() => models.RegularSchedule.destroy({ where: {} }));
    afterAll(() => models.RegularSchedule.destroy({ where: {} }));

    const setupBaseSchedule = async () => {
      lastValidatedAtStartTime = new Date();
      await Promise.all([
        aSpecificOffering1.createRegularSchedule({
          weekday: 7,
          opens_at: '10:00',
          closes_at: '11:00',
        }),
        aSpecificOffering1.createRegularSchedule({
          weekday: 6,
          opens_at: '8:00',
          closes_at: '11:00',
        }),
      ]);
      lastValidatedAtEndTime = new Date();
    };

    it('should filter out services closed at the given time', () =>
      setupBaseSchedule()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            openAt: getDateFromNyTime(`${someSunday}T09:00`),
          }))
        .then(expectNoMatchingLocations));

    it('should return locations with a service open at the given time', () =>
      setupBaseSchedule()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            openAt: getDateFromNyTime(`${someSaturday}T09:00`),
          }))
        .then(expectMatchPrimaryLocation));

    it('should filter out services whose opening times are unknown (no schedule records)', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          openAt: getDateFromNyTime(`${someSaturday}T09:00`),
        })
        .then(expectNoMatchingLocations));

    it('should not include the minute at which the service closes', () =>
      setupBaseSchedule()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            openAt: getDateFromNyTime(`${someSaturday}T11:00`),
          }))
        .then(expectNoMatchingLocations));

    it('should include the minute at which the service opens', () =>
      setupBaseSchedule()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            openAt: getDateFromNyTime(`${someSaturday}T08:00`),
          }))
        .then(expectMatchPrimaryLocation));

    it('should include locations with a service whose taxonomy and time both match', async () => {
      const otherTaxonomy = await primaryLocation.Services[0].createTaxonomy({
        name: 'Other category',
      });

      await setupBaseSchedule();

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: otherTaxonomy.id,
          openAt: getDateFromNyTime(`${someSaturday}T09:00`),
        })
        .then(expectMatchPrimaryLocation);
    });

    it('should exclude locations with different services matching taxonomy and time', async () => {
      const otherService = await organization.createService(
        {
          name: 'Second service',
          Taxonomies: [{
            name: 'Other category',
          }],
        },
        {
          include: [{ model: models.Taxonomy }],
        },
      );
      primaryLocation.setServices([aSpecificOffering1, otherService]);

      const otherTaxonomy = otherService.Taxonomies[0];

      await setupBaseSchedule();

      return request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: otherTaxonomy.id,
          openAt: new Date(`${someSaturday}T09:00Z`),
        })
        .then(expectNoMatchingLocations);
    });

    describe('when a specific occasion is specified', () => {
      beforeEach(() => models.HolidaySchedule.destroy({ where: {} }));
      afterAll(() => models.HolidaySchedule.destroy({ where: {} }));

      const setupHolidaySchedule = async () => {
        lastValidatedAtStartTime = new Date();
        await Promise.all([
          setupBaseSchedule(),
          aSpecificOffering1.createHolidaySchedule({
            weekday: 7,
            occasion: 'COVID-19',
            closed: true,
          }),
          aSpecificOffering1.createHolidaySchedule({
            weekday: 6,
            opens_at: '8:00',
            closes_at: '10:00',
            occasion: 'COVID-19',
            closed: false,
          }),
        ]);
        lastValidatedAtEndTime = new Date();
      };

      it('should filter out locations that only have a regular schedule for that time', () =>
        setupBaseSchedule()
          .then(() => request(app)
            .get('/locations')
            .query({
              latitude: originLatitude,
              longitude: originLongitude,
              radius,
              openAt: getDateFromNyTime(`${someSaturday}T09:00`),
              occasion: 'COVID-19',
            }))
          .then(expectNoMatchingLocations));

      it('should filter out locations without a holiday schedule for that specific occasion', () =>
        setupHolidaySchedule()
          .then(() => request(app)
            .get('/locations')
            .query({
              latitude: originLatitude,
              longitude: originLongitude,
              radius,
              openAt: getDateFromNyTime(`${someSaturday}T09:00`),
              occasion: 'Christmas',
            }))
          .then(expectNoMatchingLocations));

      it('should return locations closed at the given time during the occasion', () =>
        setupHolidaySchedule()
          .then(() => request(app)
            .get('/locations')
            .query({
              latitude: originLatitude,
              longitude: originLongitude,
              radius,
              openAt: getDateFromNyTime(`${someSaturday}T10:30`),
              occasion: 'COVID-19',
            }))
          .then(expectNoMatchingLocations));

      it('should return locations with a service open at the given time during the occasion', () =>
        setupHolidaySchedule()
          .then(() => request(app)
            .get('/locations')
            .query({
              latitude: originLatitude,
              longitude: originLongitude,
              radius,
              openAt: getDateFromNyTime(`${someSaturday}T09:00`),
              occasion: 'COVID-19',
            }))
          .then(expectMatchPrimaryLocation));
    });
  });

  describe('when "serves zipcode" is specified', () => {
    const servedArea1 = ['10001', '10002', '10003'];
    const servedArea2 = ['10010', '10018'];

    beforeEach(() => models.ServiceArea.destroy({ where: {} }));
    afterAll(() => models.ServiceArea.destroy({ where: {} }));

    const setupBaseServiceArea = async () => {
      lastValidatedAtStartTime = new Date();
      await Promise.all([
        aSpecificOffering1.createServiceArea({
          postal_codes: servedArea1,
        }),
        aSpecificOffering1.createServiceArea({
          postal_codes: servedArea2,
        }),
      ]);
      lastValidatedAtEndTime = new Date();
    };

    const setupAllServiceArea = async () => {
      lastValidatedAtStartTime = new Date();
      await Promise.all([
        models.ServiceArea.create({
          postal_codes: [],
          service_id: primaryLocation.Services[0].id,
        }),
      ]);
      lastValidatedAtEndTime = new Date();
    };

    it('should filter out locations that don\'t serve the given zipcode', () =>
      setupBaseServiceArea()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
            servesZipcode: '10004',
          }))
        .then(expectNoMatchingLocations));

    it('should return locations with a service that serves the given zipcode', () =>
      setupBaseServiceArea()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
            servesZipcode: servedArea1[1],
          }))
        .then(expectMatchPrimaryLocation));

    it('should return locations with services that have no service area restrictions', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
          servesZipcode: '10004',
        })
        .then(expectMatchPrimaryLocation));

    it('should return locations with services that serves all areas', () =>
      setupAllServiceArea()
        .then(() => request(app)
          .get('/locations')
          .query({
            latitude: originLatitude,
            longitude: originLongitude,
            radius,
            taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
            servesZipcode: '10004',
          }))
        .then(expectMatchPrimaryLocation));

    it('should return a 400 status code when passed an invalid zipcode', () =>
      request(app)
        .get('/locations')
        .query({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          taxonomyId: primaryLocation.Services[0].Taxonomies[0].id,
          servesZipcode: 'nozip',
        })
        .expect(400));
  });

  describe('when "zipcodes" are specified', () => {
    it('should filter out locations that aren\'t in any of the given zipcodes', () =>
      request(app)
        .get('/locations')
        .query(qs.stringify({ zipcodes: ['20001'] }))
        .then(expectNoMatchingLocations));

    it('should return locations that are in one of the given zipcodes', () =>
      request(app)
        .get('/locations')
        .query(qs.stringify({ zipcodes: ['10001', '20001'] }))
        .then(expectMatchPrimaryLocation));

    it('should return a 400 status code when passed an invalid zipcode', () =>
      request(app)
        .get('/locations')
        .query(qs.stringify({ zipcodes: ['nozip'] }))
        .expect(400));

    it('should return locations without filtering when passed an empty array', () =>
      request(app)
        .get('/locations')
        .query(qs.stringify({ zipcodes: [] }))
        .then(res => expect(res.body.length).toBeGreaterThan(0)));
  });

  describe('closed flag in list response', () => {
    afterEach(() => models.EventRelatedInfo.destroy({ where: {} }));

    it('should return closed: false for locations without a CLOSURE event', () =>
      request(app)
        .get('/locations')
        .query({ organizationName: 'test org' })
        .expect(200)
        .then((res) => {
          const primary = res.body.find(l => l.name === primaryLocation.name);
          expect(primary).toBeDefined();
          expect(primary.closed).toBe(false);
        }));

    it('should return closed: true for a location with a CLOSURE event', async () => {
      await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: primaryLocation.id,
      });

      const res = await request(app)
        .get('/locations')
        .query({ organizationName: 'test org' })
        .expect(200);

      const primary = res.body.find(l => l.name === primaryLocation.name);
      expect(primary).toBeDefined();
      expect(primary.closed).toBe(true);

      const other = res.body.find(l => l.name === otherServiceLocation.name);
      expect(other).toBeDefined();
      expect(other.closed).toBe(false);
    });

    it('should return closed: false when location only has a COVID19 event', async () => {
      await models.EventRelatedInfo.create({
        event: 'COVID19',
        information: 'COVID-19 related information',
        location_id: primaryLocation.id,
      });

      const res = await request(app)
        .get('/locations')
        .query({ organizationName: 'test org' })
        .expect(200);

      const primary = res.body.find(l => l.name === primaryLocation.name);
      expect(primary).toBeDefined();
      expect(primary.closed).toBe(false);
    });

    it('should include closed flag in paginated responses', async () => {
      await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: primaryLocation.id,
      });

      const res = await request(app)
        .get('/locations')
        .query({ organizationName: 'test org', pageNumber: 0, pageSize: 10 })
        .expect(200);

      const primary = res.body.find(l => l.name === primaryLocation.name);
      expect(primary).toBeDefined();
      expect(primary.closed).toBe(true);
    });
  });

  describe('closed locations in search results', () => {
    afterEach(() => models.EventRelatedInfo.destroy({ where: {} }));

    const markClosed = async (location, { closedAgoMs = 0 } = {}) => {
      const closure = await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: location.id,
      });

      if (closedAgoMs) {
        await models.sequelize.query(
          'UPDATE event_related_info SET created_at = :createdAt WHERE id = :id',
          { replacements: { createdAt: new Date(Date.now() - closedAgoMs), id: closure.id } },
        );
      }

      return closure;
    };

    const FOUR_MONTHS_MS = 4 * 30 * 24 * 60 * 60 * 1000;

    const expectClosedLastForTextSearch = (res, closedLocation) => {
      const closed = res.body.find(l => l.name === closedLocation.name);
      expect(closed).toBeDefined();
      expect(closed.closed).toBe(true);

      // The closed location must come after every open (non-closed) location.
      const lastOpenIndex = res.body.reduce(
        (acc, location, index) => (location.closed ? acc : index),
        -1,
      );
      const closedIndex = res.body.findIndex(l => l.name === closedLocation.name);
      expect(closedIndex).toBeGreaterThan(lastOpenIndex);
    };

    it('should exclude long-closed locations from a text search', async () => {
      await markClosed(primaryLocation, { closedAgoMs: FOUR_MONTHS_MS });

      const res = await request(app)
        .get('/locations')
        .query({ searchString: 'center' })
        .expect(200);

      expect(res.body).not.toContainEqual(expect.objectContaining({ name: primaryLocation.name }));
      expect(res.body).toContainEqual(expect.objectContaining({ name: otherServiceLocation.name }));
    });

    it('should sort recently closed locations to the bottom for a text search', async () => {
      await markClosed(primaryLocation);

      const res = await request(app)
        .get('/locations')
        .query({ searchString: 'center' })
        .expect(200);

      expectClosedLastForTextSearch(res, primaryLocation);
    });

    it('should sort closed locations to the bottom for a paginated text search', async () => {
      await markClosed(primaryLocation);

      const res = await request(app)
        .get('/locations')
        .query({ searchString: 'center', pageNumber: 0, pageSize: 10 })
        .expect(200);

      expectClosedLastForTextSearch(res, primaryLocation);
    });

    it('should NOT exclude or reorder closed locations when not text searching', async () => {
      await markClosed(primaryLocation, { closedAgoMs: FOUR_MONTHS_MS });

      const res = await request(app)
        .get('/locations')
        .query({ organizationName: 'test org' })
        .expect(200);

      // Browsing (no searchString) is unaffected: the long-closed location is still returned.
      const primary = res.body.find(l => l.name === primaryLocation.name);
      expect(primary).toBeDefined();
      expect(primary.closed).toBe(true);
    });
  });
});
