/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('get location info', () => {
  let location;

  const setupData = () => models.Organization.create(
    {
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
        },
      ],
    },
    {
      include: [
        { model: models.Service, include: [{ model: models.Taxonomy }] },
        {
          model: models.Location,
          include: [
            { model: models.PhysicalAddress },
            { model: models.Phone },
            { model: models.Comment },
          ],
        },
      ],
    },
  ).then((organization) => {
    [location] = organization.Locations;
    return location.setServices(organization.Services);
  });

  beforeAll(setupData);

  const stripTimestampsAndIds = obj => Object.keys(obj).reduce((currStrippedObj, key) => {
    const value = obj[key];

    if (key === 'id' ||
       key.endsWith('Id') ||
       key.endsWith('_id') ||
       key.endsWith('At') ||
       key.endsWith('_at')) {
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

  describe('dated holiday schedules', () => {
    let service;

    beforeAll(async () => {
      [service] = await location.getServices();
      // PATCH /services/:id refuses services without a DocumentsInfo row.
      await models.DocumentsInfo.create({ service_id: service.id });
    });
    afterEach(() => models.HolidaySchedule.destroy({ where: { service_id: service.id } }));

    const getHolidaySchedules = async () => {
      const res = await request(app)
        .get(`/locations/${location.id}`)
        .expect(200);
      return res.body.Services[0].HolidaySchedules;
    };

    it('leaves out schedules whose valid_to has passed', async () => {
      await models.HolidaySchedule.bulkCreate([
        {
          service_id: service.id,
          closed: false,
          weekday: 1,
          opens_at: '09:00',
          closes_at: '17:00',
          occasion: 'EXPIRED',
          valid_from: '2020-03-27',
          valid_to: '2020-07-27',
        },
        {
          service_id: service.id,
          closed: false,
          weekday: 2,
          opens_at: '09:00',
          closes_at: '17:00',
          occasion: 'ONGOING',
          valid_from: '2020-03-27',
          valid_to: '2999-07-27',
        },
        {
          service_id: service.id,
          closed: false,
          weekday: 3,
          opens_at: '09:00',
          closes_at: '17:00',
          occasion: 'OPEN_ENDED',
        },
      ]);

      const occasions = (await getHolidaySchedules()).map(({ occasion }) => occasion).sort();
      expect(occasions).toEqual(['ONGOING', 'OPEN_ENDED']);
    });

    it('stores HSDS recurrence fields sent through PATCH /services/:id', async () => {
      await request(app)
        .patch(`/services/${service.id}`)
        .send({
          irregularHours: [{
            weekday: 'Friday',
            opensAt: '09:00',
            closesAt: '17:00',
            closed: false,
            occasion: 'MONTHLY',
            freq: 'MONTHLY',
            byday: '2FR',
            validFrom: '2026-03-27',
            validTo: '2999-07-27',
          }],
        })
        .expect(204);

      const [schedule] = await getHolidaySchedules();
      expect(schedule).toMatchObject({
        freq: 'MONTHLY',
        byday: '2FR',
        valid_from: '2026-03-27',
        valid_to: '2999-07-27',
        // The legacy columns are kept in sync until they're dropped.
        start_date: '2026-03-27',
        end_date: '2999-07-27',
      });
    });

    it('rejects a BYDAY value that isn\'t RFC 5545', () =>
      request(app)
        .patch(`/services/${service.id}`)
        .send({
          irregularHours: [{
            weekday: 'Friday',
            opensAt: '09:00',
            closesAt: '17:00',
            closed: false,
            occasion: 'MONTHLY',
            byday: 'second friday',
          }],
        })
        .expect(400));
    it('rejects BYDAY weeks counted from the end other than the last', () =>
      request(app)
        .patch(`/services/${service.id}`)
        .send({
          irregularHours: [{
            weekday: 'Friday',
            opensAt: '09:00',
            closesAt: '17:00',
            closed: false,
            byday: '-2FR',
          }],
        })
        .expect(400));
  });

  describe('closed flag', () => {
    afterEach(() => models.EventRelatedInfo.destroy({ where: { location_id: location.id } }));

    it('should return closed: false when location has no events', () =>
      request(app)
        .get(`/locations/${location.id}`)
        .expect(200)
        .then(res => expect(res.body.closed).toBe(false)));

    it('should return closed: true when location has a CLOSURE event', async () => {
      await models.EventRelatedInfo.create({
        event: 'CLOSURE',
        information: 'Location is closed',
        location_id: location.id,
      });

      const res = await request(app)
        .get(`/locations/${location.id}`)
        .expect(200);

      expect(res.body.closed).toBe(true);
    });

    it('should return closed: false when location only has a COVID19 event', async () => {
      await models.EventRelatedInfo.create({
        event: 'COVID19',
        information: 'COVID-19 related information',
        location_id: location.id,
      });

      const res = await request(app)
        .get(`/locations/${location.id}`)
        .expect(200);

      expect(res.body.closed).toBe(false);
    });
  });
});
