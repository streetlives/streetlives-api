/**
 * @jest-environment node
 */

import request from 'supertest';
import qs from 'qs';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';

describe('find locations', () => {
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);

  let eligibilityFrom0To18Location;
  let eligibilityFrom18PlusLocation;
  let eligibilityFrom18To24Location;
  let eligibilityFrom24To60Location;
  let eligibilityFrom60PlusLocation;
  let eligibilityAllAgesLocation;

  let ageEligibilityParameter;
  // TODO: test age eligibility in conjunction with other eligibilities
  // let membershipEligibilityParameter;

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
    await models.Eligibility.destroy({ where: {} });
    await models.EligibilityParameter.destroy({ where: {} });
  };

  async function createLocationServiceWrapper(organization, eligibilityParameter) {
    const service = await organization.createService({
      name: eligibilityParameter.eligible_values[0].population_served,
      Taxonomies: [{
        name: 'Shelter',
      }],
    }, {
      include: [
        { model: models.Taxonomy },
      ],
    });
    const location = await organization.createLocation({
      name: eligibilityParameter.eligible_values[0].population_served,
      position: pointNearOrigin,
      PhysicalAddresses: [{
        address_1: '123 W 50th St.',
        city: 'New York',
        state_province: 'NY',
        postal_code: '10001',
        country: 'US',
      }],
    }, {
      model: models.Location,
      include: [
        models.PhysicalAddress,
      ],
    });
    await location.setServices([service]);
    await eligibilityParameter.setService(service);
    return location;
  }

  const setupData = async () => {
    await clearData();

    const organization = await models.Organization.create({
      name: 'The Test Org',
      description: 'An organization meant for testing purposes.',
    });

    ageEligibilityParameter = await models.EligibilityParameter.create({
      name: 'age',
    });
    // membershipEligibilityParameter = await models.EligibilityParameter.create({
    //  name: 'membership',
    // });

    const eligibilityFrom0To18 = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: null,
        age_max: 18,
        all_ages: null,
        population_served: 'children',
      }],
    });
    eligibilityFrom0To18Location =
      await createLocationServiceWrapper(organization, eligibilityFrom0To18);
    const eligibility18Plus = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: 18,
        age_max: null,
        all_ages: null,
        population_served: '18+',
      }],
    });
    eligibilityFrom18PlusLocation =
      await createLocationServiceWrapper(organization, eligibility18Plus);
    const eligibilityFrom18To24 = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: 18,
        age_max: 24,
        all_ages: null,
        population_served: '18-24',
      }],
    });
    eligibilityFrom18To24Location =
      await createLocationServiceWrapper(organization, eligibilityFrom18To24);
    const eligibilityFrom24To60 = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: 24,
        age_max: 60,
        all_ages: null,
        population_served: '24-60',
      }],
    });
    eligibilityFrom24To60Location =
      await createLocationServiceWrapper(organization, eligibilityFrom24To60);
    const eligibilityFrom60Plus = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: 60,
        age_max: null,
        all_ages: null,
        population_served: '60+',
      }],
    });
    eligibilityFrom60PlusLocation =
      await createLocationServiceWrapper(organization, eligibilityFrom60Plus);
    const eligibilityAllAges = await ageEligibilityParameter.createEligibility({
      eligible_values: [{
        age_min: null,
        age_max: null,
        all_ages: true,
        population_served: 'Everyone',
      }],
    });
    eligibilityAllAgesLocation =
      await createLocationServiceWrapper(organization, eligibilityAllAges);
  };

  beforeEach(setupData);
  afterAll(clearData);

  describe('when "age" filter is specific', () => {
    it('should filter locations for age 10', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 10 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id, eligibilityAllAgesLocation.id].sort())));

    it('should filter locations for age 18', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 18 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id,
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
      ].sort())));

    it('should filter locations for age 24', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 24 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityFrom24To60Location.id,
      ].sort())));

    it('should filter locations for age 60', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 60 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom24To60Location.id,
        eligibilityFrom60PlusLocation.id,
      ].sort())));

    it('should filter locations for age 61', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 61 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom60PlusLocation.id,
      ].sort())));
  });
});
