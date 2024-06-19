/**
 * @jest-environment node
 */

import request from 'supertest';
import qs from 'qs';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';

describe('filter by age', () => {
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);

  let eligibilityFrom0To18Location;
  let eligibilityFrom18PlusLocation;
  let eligibilityFrom18To24Location;
  let eligibilityFrom24To60Location;
  let eligibilityFrom60PlusLocation;
  let eligibilityAllAgesLocation;
  // FIXME: let locationWithoutEligibility;
  let locationWithGenderFemaleEligibility;
  let locationWithGenderFemaleAndAge18PlusEligibility;

  let ageEligibilityParameter;
  // test age eligibility in conjunction with other eligibilities
  let genderEligibilityParameter;

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

  async function createLocationServiceWrapper(
    organization,
    eligibilityParameter,
    locationServiceName,
  ) {
    const name = eligibilityParameter === null ?
      'No eligibilities' :
      (locationServiceName ||
        eligibilityParameter.eligible_values[0].population_served);
    const service = await organization.createService({
      name,
      Taxonomies: [{
        name: 'Shelter',
      }],
    }, {
      include: [
        { model: models.Taxonomy },
      ],
    });
    const location = await organization.createLocation({
      name,
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
    if (eligibilityParameter) {
      if (Array.isArray(eligibilityParameter)) {
        for (const param of eligibilityParameter) {
          await param.setService(service);
        }
      } else {
        await eligibilityParameter.setService(service);
      }
    }
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
    genderEligibilityParameter = await models.EligibilityParameter.create({
      name: 'gender',
    });

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

    // service without eligibility
    // locationWithoutEligibility =
    //   await createLocationServiceWrapper(organization, null);
    // service with gender eligibility only
    locationWithGenderFemaleEligibility =
      await createLocationServiceWrapper(
        organization,
        await genderEligibilityParameter.createEligibility({
          eligible_values: ['female'],
        }),
        'location With Gender Female Eligibility',
      );
    // service with gender eligibility plus age eligibility
    locationWithGenderFemaleAndAge18PlusEligibility =
      await createLocationServiceWrapper(
        organization,
        [
          await genderEligibilityParameter.createEligibility({
            eligible_values: ['female'],
          }),
          await ageEligibilityParameter.createEligibility({
            eligible_values: [{
              age_min: 18,
              age_max: null,
              all_ages: null,
              population_served: '18+',
            }],
          }),
        ],
        'location With Gender Female And Age 18 Plus Eligibility',
      );
  };

  beforeEach(setupData);
  afterAll(clearData);

  describe('when "age" filter is specified', () => {
    it('should filter locations for age 10', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 10 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id,
        eligibilityAllAgesLocation.id,
        // FIXME: locationWithoutEligibility.id,
        locationWithGenderFemaleEligibility.id,
      ].sort())));

    it('should filter locations for age 18', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 18 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id,
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for age 24', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 24 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityFrom24To60Location.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for age 60', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 60 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom24To60Location.id,
        eligibilityFrom60PlusLocation.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for age 61', () => request(app)
      .get('/locations')
      .query(qs.stringify({ age: 61 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityAllAgesLocation.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom60PlusLocation.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for gender female', () => request(app)
      .get('/locations')
      .query(qs.stringify({ gender: 'female' }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityFrom24To60Location.id,
        eligibilityFrom60PlusLocation.id,
        eligibilityAllAgesLocation.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for gender male', () => request(app)
      .get('/locations')
      .query(qs.stringify({ gender: 'male' }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom0To18Location.id,
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityFrom24To60Location.id,
        eligibilityFrom60PlusLocation.id,
        eligibilityAllAgesLocation.id,
      ].sort())));

    it('should filter locations for gender female and age 19', () => request(app)
      .get('/locations')
      .query(qs.stringify({ gender: 'female', age: 19 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityAllAgesLocation.id,
        locationWithGenderFemaleEligibility.id,
        locationWithGenderFemaleAndAge18PlusEligibility.id,
      ].sort())));

    it('should filter locations for gender male and age 19', () => request(app)
      .get('/locations')
      .query(qs.stringify({ gender: 'male', age: 19 }))
      .then(res => expect(res.body.map(l => l.id).sort()).toEqual([
        eligibilityFrom18PlusLocation.id,
        eligibilityFrom18To24Location.id,
        eligibilityAllAgesLocation.id,
      ].sort())));
  });
});
