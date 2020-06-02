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

  let primaryLocation;
  let otherServiceLocation;
  let hiddenLocation;
  let farLocation;

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
    const organization = await models.Organization.create({
      name: 'The Test Org',
      description: 'An organization meant for testing purposes.',
    });

    const baseLocationData = {
      organization_id: organization.id,
      Services: [{
        organization_id: organization.id,
        name: 'A specific offering',
        description: 'Only this service is described this way',
        Taxonomies: [{
          name: 'Shelter',
        }],
      }],
    };
    const associationParams = {
      include: [
        {
          model: models.Service,
          include: [{ model: models.Taxonomy }],
        },
        models.PhysicalAddress,
      ],
    };

    [primaryLocation, hiddenLocation, otherServiceLocation, farLocation] = await Promise.all([
      models.Location.create(
        {
          ...baseLocationData,
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
        associationParams,
      ),
      models.Location.create(
        {
          ...baseLocationData,
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
        associationParams,
      ),
      models.Location.create(
        {
          ...baseLocationData,
          name: 'Other nearby center',
          position: pointSlightlyFurtherFromOrigin,
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
  };

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

    it('should not match locations that have the given string in their name', () =>
      makeRequestWithSearchString('center')
        .expect(200)
        .then(expectNoMatchingLocations));
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

      const otherMatchingService = await primaryLocation.createService({
        organization_id: primaryLocation.organization_id,
        name: 'Other matching service',
      });
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
      service2 = await primaryLocation.createService({
        organization_id: primaryLocation.organization_id,
        name: 'Second service',
      });
      await service2.createTaxonomy({
        name: 'Other category',
      });
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
      service2 = await primaryLocation.createService({
        organization_id: primaryLocation.organization_id,
        name: 'Second service',
      });
      await service2.createTaxonomy({
        name: 'Other category',
      });
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
      await models.RequiredDocument.create({
        document: documentTypes.referralLetter,
        service_id: primaryLocation.Services[0].id,
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
      await models.RequiredDocument.create({
        document: documentTypes.photoId,
        service_id: primaryLocation.Services[0].id,
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

    const setupBaseSchedule = () => Promise.all([
      models.RegularSchedule.create({
        weekday: 7,
        opens_at: '10:00',
        closes_at: '11:00',
        service_id: primaryLocation.Services[0].id,
      }),
      models.RegularSchedule.create({
        weekday: 6,
        opens_at: '8:00',
        closes_at: '11:00',
        service_id: primaryLocation.Services[0].id,
      }),
    ]);

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
      const otherService = await primaryLocation.createService({
        organization_id: primaryLocation.organization_id,
        name: 'Second service',
      });
      const otherTaxonomy = await otherService.createTaxonomy({
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
          openAt: new Date(`${someSaturday}T09:00Z`),
        })
        .then(expectNoMatchingLocations);
    });

    describe('when a specific occasion is specified', () => {
      beforeEach(() => models.HolidaySchedule.destroy({ where: {} }));
      afterAll(() => models.HolidaySchedule.destroy({ where: {} }));

      const setupHolidaySchedule = () => Promise.all([
        setupBaseSchedule(),
        models.HolidaySchedule.create({
          weekday: 7,
          service_id: primaryLocation.Services[0].id,
          occasion: 'COVID-19',
          closed: true,
        }),
        models.HolidaySchedule.create({
          weekday: 6,
          opens_at: '8:00',
          closes_at: '10:00',
          service_id: primaryLocation.Services[0].id,
          occasion: 'COVID-19',
          closed: false,
        }),
      ]);

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

    const setupBaseServiceArea = () => Promise.all([
      models.ServiceArea.create({
        postal_codes: servedArea1,
        service_id: primaryLocation.Services[0].id,
      }),
      models.ServiceArea.create({
        postal_codes: servedArea2,
        service_id: primaryLocation.Services[0].id,
      }),
    ]);

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
});
