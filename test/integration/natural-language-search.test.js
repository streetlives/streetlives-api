/**
 * @jest-environment node
 */

import request from 'supertest';
import qs from 'qs';

// Mock out the OpenAI-backed parser: these tests cover how the /locations
// route maps its output to filters, falls back when it fails, and interacts
// with explicit query params. The parser itself is covered by unit tests.
jest.mock('../../src/controllers/openai', () => ({
  __esModule: true,
  default: jest.fn(),
  parseNaturalLanguageQuery: jest.fn(),
}));

// eslint-disable-next-line import/first
import { parseNaturalLanguageQuery } from '../../src/controllers/openai';
// eslint-disable-next-line import/first
import app from '../../src/app';
// eslint-disable-next-line import/first
import models from '../../src/models';
// eslint-disable-next-line import/first
import geometry from '../../src/utils/geometry';
// eslint-disable-next-line import/first
import { documentTypes, eligibilityParams } from '../../src/services/services';

describe('find locations with a natural language query', () => {
  const originLongitude = -73.981452;
  const originLatitude = 40.763765;
  const radius = 2000;
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);
  const pointSlightlyFurtherFromOrigin = geometry.createPoint(-73.991304, 40.751907);
  const pointFarFromOrigin = geometry.createPoint(-73.951042, 40.718576);

  let organization;
  let shelterLocation;
  let foodLocation;
  let farLocation;

  let shelterService;
  let foodService;
  let farService;

  let foodTaxonomy;

  // A full parser result (the shape the OpenAI controller returns), all nulls.
  const nlResult = overrides => ({
    searchString: null,
    streetAddress: null,
    neighborhood: null,
    openAt: null,
    gender: null,
    membership: null,
    ageMin: null,
    ageMax: null,
    referralRequired: null,
    photoIdRequired: null,
    zipcodes: null,
    taxonomyNames: null,
    ...overrides,
  });

  const clearData = async () => {
    await Promise.all([
      models.ServiceAtLocation.destroy({ where: {} }),
      models.ServiceTaxonomy.destroy({ where: {} }),
      models.PhysicalAddress.destroy({ where: {} }),
      models.EventRelatedInfo.destroy({ where: {} }),
      models.NycNeighborhoodGeometries.destroy({ where: {} }),
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

    organization = await models.Organization.create(
      {
        name: 'The Test Org',
        description: 'An organization meant for testing purposes.',
        Services: [
          {
            name: 'A shelter service',
            Taxonomies: [{ name: 'Shelter' }],
          },
          {
            name: 'A food service',
            Taxonomies: [{ name: 'Food' }],
          },
          {
            name: 'A far-off shelter service',
            Taxonomies: [{ name: 'Legal Services' }],
          },
        ],
        Locations: [
          {
            name: 'Shelter center',
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
            name: 'Food center',
            position: pointSlightlyFurtherFromOrigin,
            PhysicalAddresses: [{
              address_1: '456 Broadway',
              city: 'New York',
              state_province: 'NY',
              postal_code: '10018',
              country: 'US',
            }],
          },
          {
            name: 'Far-off place',
            position: pointFarFromOrigin,
          },
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
            include: [models.PhysicalAddress],
          },
        ],
      },
    );

    [shelterLocation, foodLocation, farLocation] = organization.Locations;
    [shelterService, foodService, farService] = organization.Services;
    [foodTaxonomy] = foodService.Taxonomies;

    await Promise.all([
      shelterLocation.setServices([shelterService]),
      foodLocation.setServices([foodService]),
      farLocation.setServices([farService]),
    ]);
  };

  beforeEach(async () => {
    parseNaturalLanguageQuery.mockReset();
    await setupData();
  });
  afterAll(clearData);

  const queryLocations = params =>
    request(app)
      .get('/locations')
      .query({
        latitude: originLatitude,
        longitude: originLongitude,
        radius,
        ...params,
      });

  const expectOnlyLocations = (res, ...names) => {
    expect(res.body.map(l => l.name).sort()).toEqual(names.sort());
  };

  describe('when the parser returns structured params', () => {
    it('filters by the matching taxonomies for taxonomyNames', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ taxonomyNames: ['Shelter'] }));

      const res = await queryLocations({ naturalLanguageQuery: 'a place to sleep' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });

    it('falls back to the taxonomy names as a keyword search when none match', async () => {
      // When the parser's taxonomy names don't match a known taxonomy, the search
      // must stay scoped (using the names as a keyword search string) rather than
      // dropping the constraint and broadening to an effectively unfiltered search.
      parseNaturalLanguageQuery
        .mockResolvedValue(nlResult({ taxonomyNames: ['No Such Taxonomy'] }));

      const res = await queryLocations({ naturalLanguageQuery: 'a place to sleep' })
        .expect(200);

      expectOnlyLocations(res);
    });

    it('uses the extracted searchString as the search string', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ searchString: 'shelter' }));

      const res = await queryLocations({ naturalLanguageQuery: 'anywhere I can sleep' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });

    it('filters by extracted zipcodes', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ zipcodes: ['10001'] }));

      const res = await queryLocations({ naturalLanguageQuery: 'services in 10001' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });

    it('filters by an extracted street address', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ streetAddress: '123 W 50th' }));

      const res = await queryLocations({ naturalLanguageQuery: 'help near 123 W 50th St' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });

    it('filters by an extracted neighborhood using the neighborhood geometries', async () => {
      // A box around midtown Manhattan that contains the two nearby locations
      // but not the far-off one.
      await models.NycNeighborhoodGeometries.create({
        neighborhood: 'Midtown West',
        borough: 'Manhattan',
        geometry: {
          type: 'Polygon',
          crs: { type: 'name', properties: { name: 'EPSG:4326' } },
          coordinates: [[
            [-74.05, 40.70],
            [-74.05, 40.80],
            [-73.97, 40.80],
            [-73.97, 40.70],
            [-74.05, 40.70],
          ]],
        },
      });

      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ neighborhood: 'Midtown' }));

      // No coordinates: the neighborhood filter is what narrows things down.
      const res = await request(app)
        .get('/locations')
        .query({ naturalLanguageQuery: 'help in midtown' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name, foodLocation.name);
    });

    describe('with an extracted openAt', () => {
      const someSaturday = '2019-06-08';
      const someSunday = '2019-06-09';
      const timeZone = 'America/New_York';
      const someDate = new Date(someSunday);
      const timezoneOffset =
        someDate.getTime() - new Date(someDate.toLocaleString([], { timeZone })).getTime();
      const getDateFromNyTime = dateStr =>
        new Date(new Date(dateStr).getTime() + timezoneOffset);

      beforeEach(async () => {
        await models.RegularSchedule.destroy({ where: {} });
        await shelterService.createRegularSchedule({
          weekday: 6,
          opens_at: '8:00',
          closes_at: '11:00',
        });
      });
      afterAll(() => models.RegularSchedule.destroy({ where: {} }));

      it('returns only locations open at the extracted time', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({
          openAt: getDateFromNyTime(`${someSaturday}T09:00`).toISOString(),
        }));

        const res = await queryLocations({ naturalLanguageQuery: 'shelter open saturday morning' })
          .expect(200);

        expectOnlyLocations(res, shelterLocation.name);
      });

      it('filters out locations closed at the extracted time', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({
          openAt: getDateFromNyTime(`${someSunday}T09:00`).toISOString(),
        }));

        const res = await queryLocations({ naturalLanguageQuery: 'shelter open sunday morning' })
          .expect(200);

        expectOnlyLocations(res);
      });

      it('ignores an openAt value that is not a parseable date', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({ openAt: 'not-a-real-date' }));

        const res = await queryLocations({ naturalLanguageQuery: 'shelter open whenever' })
          .expect(200);

        expectOnlyLocations(res, shelterLocation.name, foodLocation.name);
      });
    });

    describe('with extracted eligibility', () => {
      beforeEach(async () => {
        await models.Eligibility.destroy({ where: {} });
        await models.EligibilityParameter.destroy({ where: {} });

        const genderParam =
          await models.EligibilityParameter.create({ name: eligibilityParams.gender });
        await shelterService.createEligibility({
          parameter_id: genderParam.id,
          eligible_values: ['female'],
        });
      });
      afterAll(() => Promise.all([
        models.Eligibility.destroy({ where: {} }),
        models.EligibilityParameter.destroy({ where: {} }),
      ]));

      it('applies an extracted gender as an eligibility filter', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({ gender: 'female' }));

        const res = await queryLocations({ naturalLanguageQuery: 'services for women' })
          .expect(200);

        expectOnlyLocations(res, shelterLocation.name);
      });

      it('filters out locations not eligible for the extracted gender', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({ gender: 'male' }));

        const res = await queryLocations({ naturalLanguageQuery: 'services for men' })
          .expect(200);

        expectOnlyLocations(res);
      });
    });

    describe('with extracted document requirements', () => {
      beforeEach(async () => {
        await models.RequiredDocument.destroy({ where: {} });
        await shelterService.createRequiredDocument({ document: documentTypes.photoId });
      });
      afterAll(() => models.RequiredDocument.destroy({ where: {} }));

      it('applies extracted document requirements as filters', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({
          photoIdRequired: true,
          referralRequired: false,
        }));

        const res = await queryLocations({ naturalLanguageQuery: 'shelter that takes photo id' })
          .expect(200);

        expectOnlyLocations(res, shelterLocation.name);
      });

      it('filters out locations requiring documents that should not be required', async () => {
        parseNaturalLanguageQuery.mockResolvedValue(nlResult({
          photoIdRequired: false,
          taxonomyNames: ['Shelter'],
        }));

        const res = await queryLocations({ naturalLanguageQuery: 'shelter without photo id' })
          .expect(200);

        expectOnlyLocations(res);
      });
    });
  });

  describe('interaction with explicit query params', () => {
    it('prefers an explicit searchString over the extracted one', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ searchString: 'food' }));

      const res = await queryLocations({
        naturalLanguageQuery: 'food help',
        searchString: 'shelter',
      }).expect(200);

      expectOnlyLocations(res, shelterLocation.name);
      expect(parseNaturalLanguageQuery).toHaveBeenCalledTimes(1);
    });

    it('prefers an explicit taxonomyId over extracted taxonomyNames', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ taxonomyNames: ['Shelter'] }));

      const res = await queryLocations({
        naturalLanguageQuery: 'a place to sleep',
        taxonomyId: foodTaxonomy.id,
      }).expect(200);

      expectOnlyLocations(res, foodLocation.name);
    });

    it('prefers explicit zipcodes over extracted ones', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult({ zipcodes: ['10001'] }));

      const res = await request(app)
        .get('/locations')
        .query(qs.stringify({
          latitude: originLatitude,
          longitude: originLongitude,
          radius,
          naturalLanguageQuery: 'services in 10001',
          zipcodes: ['10018'],
        }))
        .expect(200);

      expectOnlyLocations(res, foodLocation.name);
    });
  });

  describe('fallback behavior', () => {
    it('uses the raw query as a search string when the parser throws', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      parseNaturalLanguageQuery.mockRejectedValue(new Error('OpenAI is down'));

      const res = await queryLocations({ naturalLanguageQuery: 'shelter' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
      consoleError.mockRestore();
    });

    it('uses the raw query as a search string when a guard returns null', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(null);

      const res = await queryLocations({ naturalLanguageQuery: 'shelter' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });

    it('does not let the fallback override an explicit searchString', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(null);

      const res = await queryLocations({
        naturalLanguageQuery: 'food',
        searchString: 'shelter',
      }).expect(200);

      expectOnlyLocations(res, shelterLocation.name);
    });
  });

  describe('what gets sent to the parser', () => {
    it('redacts phone numbers, emails and SSNs before calling the parser', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult());

      await queryLocations({
        naturalLanguageQuery: 'shelter, call 212-555-1234 or me@example.com, ssn 123-45-6789',
      }).expect(200);

      expect(parseNaturalLanguageQuery).toHaveBeenCalledTimes(1);
      const [sanitizedQuery, currentDatetime] = parseNaturalLanguageQuery.mock.calls[0];
      expect(sanitizedQuery).toContain('[PHONE]');
      expect(sanitizedQuery).toContain('[EMAIL]');
      expect(sanitizedQuery).toContain('[SSN]');
      expect(sanitizedQuery).not.toContain('212-555-1234');
      expect(sanitizedQuery).not.toContain('me@example.com');
      expect(sanitizedQuery).not.toContain('123-45-6789');
      expect(new Date(currentDatetime).getTime()).not.toBeNaN();
    });

    it('redacts international phone numbers, unformatted SSNs and card numbers', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult());

      await queryLocations({
        // eslint-disable-next-line max-len
        naturalLanguageQuery: 'shelter, call +44 20 7946 0958, ssn 123456789, card 4111 1111 1111 1111',
      }).expect(200);

      const [sanitizedQuery] = parseNaturalLanguageQuery.mock.calls[0];
      expect(sanitizedQuery).toContain('[PHONE]');
      expect(sanitizedQuery).toContain('[SSN]');
      expect(sanitizedQuery).toContain('[CARD]');
      expect(sanitizedQuery).not.toContain('7946 0958');
      expect(sanitizedQuery).not.toContain('123456789');
      expect(sanitizedQuery).not.toContain('4111 1111 1111 1111');
    });

    it('does not redact street addresses, which the parser is designed to extract', async () => {
      parseNaturalLanguageQuery.mockResolvedValue(nlResult());

      await queryLocations({
        naturalLanguageQuery: 'food near 123 Main St, zip 10001',
      }).expect(200);

      const [sanitizedQuery] = parseNaturalLanguageQuery.mock.calls[0];
      expect(sanitizedQuery).toBe('food near 123 Main St, zip 10001');
    });

    it('does not call the parser when naturalLanguageQuery is absent', async () => {
      await queryLocations({ searchString: 'shelter' }).expect(200);

      expect(parseNaturalLanguageQuery).not.toHaveBeenCalled();
    });

    it('rejects queries longer than 500 characters without calling the parser', async () => {
      await queryLocations({ naturalLanguageQuery: 'a'.repeat(501) })
        .expect(400);

      expect(parseNaturalLanguageQuery).not.toHaveBeenCalled();
    });
  });

  describe('closed locations in search results', () => {
    afterEach(() => models.EventRelatedInfo.destroy({ where: {} }));

    it('includes locations closed for more than 3 months in search results', async () => {
      await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: shelterLocation.id,
      });
      const backdate = 'UPDATE event_related_info SET created_at = NOW() - INTERVAL \'4 months\'';
      await models.sequelize.query(backdate);

      const res = await queryLocations({ searchString: 'center' })
        .expect(200);

      expectOnlyLocations(res, foodLocation.name, shelterLocation.name);
    });

    it('does not reorder closed locations in search results', async () => {
      await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: shelterLocation.id,
      });

      const res = await queryLocations({ searchString: 'center' })
        .expect(200);

      // The shelter location is nearer, so it sorts first even though it's closed.
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe(shelterLocation.name);
      expect(res.body[0].closed).toBe(true);
      expect(res.body[1].name).toBe(foodLocation.name);
    });
  });

  describe('neighborhood matching in plain search', () => {
    it('matches locations by geometry when the search names a known neighborhood', async () => {
      // The same midtown box used in the extracted-neighborhood test: contains
      // the two nearby locations but not the far-off one.
      await models.NycNeighborhoodGeometries.create({
        neighborhood: 'Midtown West',
        borough: 'Manhattan',
        geometry: {
          type: 'Polygon',
          crs: { type: 'name', properties: { name: 'EPSG:4326' } },
          coordinates: [[
            [-74.05, 40.70],
            [-74.05, 40.80],
            [-73.97, 40.80],
            [-73.97, 40.70],
            [-74.05, 40.70],
          ]],
        },
      });

      // No coordinates: the neighborhood match is what narrows things down.
      const res = await request(app)
        .get('/locations')
        .query({ searchString: 'Midtown' })
        .expect(200);

      expectOnlyLocations(res, shelterLocation.name, foodLocation.name);
    });

    it('treats LIKE metacharacters in the search string literally for neighborhoods', async () => {
      // Same midtown box as above, containing the two nearby locations.
      await models.NycNeighborhoodGeometries.create({
        neighborhood: 'Midtown West',
        borough: 'Manhattan',
        geometry: {
          type: 'Polygon',
          crs: { type: 'name', properties: { name: 'EPSG:4326' } },
          coordinates: [[
            [-74.05, 40.70],
            [-74.05, 40.80],
            [-73.97, 40.80],
            [-73.97, 40.70],
            [-74.05, 40.70],
          ]],
        },
      });

      // "Midtow_" is not a literal substring of "Midtown West"; only if the
      // underscore is (wrongly) treated as a single-char LIKE wildcard would it
      // match the neighborhood, trip the known-neighborhood gate, and pull in
      // every location inside the geometry via the expensive PostGIS condition.
      // No location name contains "midtow", so the fuzzy/text paths can't match.
      const res = await request(app)
        .get('/locations')
        .query({ searchString: 'Midtow_' })
        .expect(200);

      expectOnlyLocations(res);
    });
  });

  describe('acronym normalization in search', () => {
    it('matches dot-separated acronym names when searching without dots', async () => {
      const showLocation = await organization.createLocation({
        name: 'S.H.O.W. community hub',
        position: pointNearOrigin,
      });
      await showLocation.setServices([shelterService]);

      const res = await queryLocations({ searchString: 'SHOW' })
        .expect(200);

      expect(res.body).toContainEqual(expect.objectContaining({ name: showLocation.name }));
    });

    it('matches undotted names when searching with a dot-separated acronym', async () => {
      const showLocation = await organization.createLocation({
        name: 'SHOW community hub',
        position: pointNearOrigin,
      });
      await showLocation.setServices([shelterService]);

      const res = await queryLocations({ searchString: 'S.H.O.W.' })
        .expect(200);

      expect(res.body).toContainEqual(expect.objectContaining({ name: showLocation.name }));
    });
  });
});
