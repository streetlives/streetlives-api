/**
 * @jest-environment node
 */

import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import setupRoutes from '../../src/routes';
import models from '../../src/models';
import {
  createInstance,
  updateInstance,
  destroyInstance,
  destroyAllInstances,
} from '../../src/services/data-changes';
import { deleteService } from '../../src/services/services';

const CLIENT_ID = 'cache-mirror-client';
const EDITOR = 'editor@example.org';
const { sequelize, Sequelize } = models;

// API Gateway's authorizer puts verified claims on the event; the test app stands in for it.
const appWithClaims = (claims) => {
  const app = express();
  app.use(bodyParser.json());
  app.use((req, res, next) => {
    if (claims) {
      req.apiGateway = { event: { requestContext: { authorizer: { claims } } } };
    }
    next();
  });
  setupRoutes(app);
  return app;
};
const feedApp = appWithClaims({ client_id: CLIENT_ID, token_use: 'access' });

const select = (sql, bind) => sequelize.query(sql, { bind, type: Sequelize.QueryTypes.SELECT });
// A `since` after every earlier write and before every later one. Postgres stamps changes in
// microseconds and `since` has milliseconds, so a write in the same millisecond as this read
// would otherwise count as "since": step to the next millisecond and let the clock pass it.
const dbNow = async () => {
  const [{ now }] = await select('SELECT clock_timestamp() AS now');
  const since = new Date(new Date(now).getTime() + 1);
  await new Promise(resolve => setTimeout(resolve, 2));
  return since.toISOString();
};

const readAll = async (path, since, limit) => {
  const items = [];
  let query = { since, limit };
  for (;;) {
    const { body } = await request(feedApp).get(path).query(query).expect(200);
    items.push(...(body.changes || body.edits));
    if (!body.hasMore) return items;
    query = { cursor: body.nextCursor, limit };
  }
};
const changedIds = async since =>
  (await readAll('/location-changes', since)).map(change => change.location_id);
const editsSince = since => readAll('/location-edits', since);

const createOrganization = (name, locationCount = 1) => models.Organization.create({
  name,
  Locations: Array.from({ length: locationCount }, (_, index) => ({
    name: `${name} location ${index + 1}`,
    PhysicalAddresses: [{
      address_1: `${index + 1} West 30th Street`,
      city: 'New York',
      state_province: 'NY',
      postal_code: '10001',
      country: 'United States',
    }],
    Phones: [{ number: '212.121.0123' }],
  })),
}, {
  include: [{ model: models.Location, include: [models.PhysicalAddress, models.Phone] }],
});

const createServiceAt = async (location, name) => {
  const service = await models.Service.create({ name, organization_id: location.organization_id });
  await location.addService(service);
  return service;
};

describe('location change feed', () => {
  const environment = {};

  beforeAll(() => {
    environment.allowed = process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS;
    environment.settle = process.env.CHANGE_FEED_SETTLE_SECONDS;
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = `other-client, ${CLIENT_ID}`;
    process.env.CHANGE_FEED_SETTLE_SECONDS = '0';
  });

  afterAll(() => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = environment.allowed || '';
    process.env.CHANGE_FEED_SETTLE_SECONDS = environment.settle || '';
  });

  describe('which locations changed', () => {
    it('records a location when a row of its own detail changes', async () => {
      const organization = await createOrganization('Address Org');
      const [location] = organization.Locations;
      const since = await dbNow();

      const [address] = location.PhysicalAddresses;
      await updateInstance(EDITOR, address, { address_1: '9 West 30th Street' });

      expect(await changedIds(since)).toEqual([location.id]);
    });

    it('records the locations of a service when a service-level row changes', async () => {
      const organization = await createOrganization('Schedule Org');
      const [location] = organization.Locations;
      const service = await createServiceAt(location, 'Pantry');
      const since = await dbNow();

      await createInstance(EDITOR, models.RegularSchedule.create.bind(models.RegularSchedule), {
        service_id: service.id, weekday: 2, opens_at: '09:00', closes_at: '17:00',
      });

      expect(await changedIds(since)).toEqual([location.id]);
    });

    it('records bulk deletes', async () => {
      const organization = await createOrganization('Bulk Delete Org');
      const [location] = organization.Locations;
      const service = await createServiceAt(location, 'Clinic');
      await models.RegularSchedule.create({
        service_id: service.id, weekday: 3, opens_at: '10:00', closes_at: '12:00',
      });
      const since = await dbNow();

      await destroyAllInstances(EDITOR, models.RegularSchedule, { service_id: service.id }, {
        linkField: 'service_id',
      });

      expect(await changedIds(since)).toEqual([location.id]);
    });

    it('records every location of an organization when the organization changes', async () => {
      const organization = await createOrganization('Renamed Org', 3);
      const since = await dbNow();

      await updateInstance(EDITOR, organization, { name: 'Renamed Org, Inc.' });

      expect((await changedIds(since)).sort())
        .toEqual(organization.Locations.map(({ id }) => id).sort());
    });

    it('records a metadata-only change, which still moves a last-updated date', async () => {
      const organization = await createOrganization('Reconfirmed Org');
      const [location] = organization.Locations;
      const since = await dbNow();

      await updateInstance(EDITOR, location, { name: location.name });

      expect(await changedIds(since)).toEqual([location.id]);
    });

    it('reports a deleted location as deleted', async () => {
      const organization = await createOrganization('Closing Org');
      const [location] = organization.Locations;
      const since = await dbNow();

      const where = { location_id: location.id };
      const byLocation = { linkField: 'location_id' };
      await destroyAllInstances(EDITOR, models.PhysicalAddress, where, byLocation);
      await destroyAllInstances(EDITOR, models.Phone, where, byLocation);
      await destroyInstance(EDITOR, location);

      const changes = await readAll('/location-changes', since);
      expect(changes).toEqual([expect.objectContaining({
        location_id: location.id,
        deleted: true,
      })]);
    });

    it('reports a holiday schedule expiring, which writes nothing', async () => {
      const organization = await createOrganization('Holiday Org');
      const [location] = organization.Locations;
      const [{ yesterday, expiredAt }] = await select(`SELECT
        ((now() AT TIME ZONE 'America/New_York')::date - 1)::text AS yesterday,
        ((now() AT TIME ZONE 'America/New_York')::date::timestamp
          AT TIME ZONE 'America/New_York') AS "expiredAt"`);
      // Written outside the API, so expiring is the only change the feed can see.
      await models.HolidaySchedule.create({
        location_id: location.id, closed: true, valid_from: yesterday, valid_to: yesterday,
      });
      const anHour = 60 * 60 * 1000;
      const since = new Date(new Date(expiredAt).getTime() - anHour).toISOString();

      const changes = (await readAll('/location-changes', since))
        .filter(change => change.location_id === location.id);
      expect(changes).toEqual([{
        location_id: location.id,
        changed_at: new Date(expiredAt).toISOString(),
        deleted: false,
      }]);
    });

    it('pages without losing or repeating changes', async () => {
      const organization = await createOrganization('Paged Org', 5);
      const since = await dbNow();
      for (const location of organization.Locations) {
        await updateInstance(EDITOR, location, { name: `${location.name}, renamed` });
      }

      const changes = await readAll('/location-changes', since, 2);

      expect(changes.map(({ location_id: id }) => id).sort())
        .toEqual(organization.Locations.map(({ id }) => id).sort());
    });

    it('lists every location of a change, even past the page limit', async () => {
      const organization = await createOrganization('Fanned Org', 3);
      const since = await dbNow();
      await updateInstance(EDITOR, organization, { name: 'Fanned Org, renamed' });

      const { body } = await request(feedApp)
        .get('/location-changes').query({ since, limit: 1 }).expect(200);

      expect(body.changes.map(({ location_id: id }) => id).sort())
        .toEqual(organization.Locations.map(({ id }) => id).sort());
    });

    it('ignores writes that leave no metadata', async () => {
      const organization = await createOrganization('Silent Org');
      const since = await dbNow();

      await organization.update({ name: 'Silent Org, renamed directly' });

      expect(await changedIds(since)).toEqual([]);
    });

    it('holds back changes that may not have committed everywhere yet', async () => {
      const organization = await createOrganization('Settling Org');
      const since = await dbNow();
      await updateInstance(EDITOR, organization, { name: 'Settling Org, renamed' });
      process.env.CHANGE_FEED_SETTLE_SECONDS = '3600';

      try {
        expect(await changedIds(since)).toEqual([]);
      } finally {
        process.env.CHANGE_FEED_SETTLE_SECONDS = '0';
      }
      expect(await changedIds(since)).toEqual([organization.Locations[0].id]);
    });

    it('never moves past a change still uncommitted in a long transaction', async () => {
      const slow = await createOrganization('Slow Org');
      const fast = await createOrganization('Fast Org');
      const since = await dbNow();
      const transaction = await sequelize.transaction();
      try {
        await updateInstance(EDITOR, slow.Locations[0], { name: 'Edited slowly' }, { transaction });
        await updateInstance(EDITOR, fast.Locations[0], { name: 'Edited quickly' });
        // The quick edit committed, but it is newer than the open writer, so both wait.
        expect(await changedIds(since)).toEqual([]);
        expect(await editsSince(since)).toEqual([]);
      } finally {
        await transaction.commit();
      }
      expect((await changedIds(since)).sort())
        .toEqual([slow.Locations[0].id, fast.Locations[0].id].sort());
      expect((await editsSince(since)).map(edit => edit.replacement_value).sort())
        .toEqual(['Edited quickly', 'Edited slowly']);
    });

    it('hands back a cursor that resumes after an empty page', async () => {
      const since = await dbNow();
      const { body: empty } = await request(feedApp)
        .get('/location-changes').query({ since }).expect(200);
      expect(empty).toEqual(expect.objectContaining({ changes: [], hasMore: false }));

      const organization = await createOrganization('Resumed Org');
      await updateInstance(EDITOR, organization, { name: 'Resumed Org, renamed' });
      const { body } = await request(feedApp)
        .get('/location-changes').query({ cursor: empty.nextCursor }).expect(200);

      expect(body.changes.map(({ location_id: id }) => id))
        .toEqual([organization.Locations[0].id]);
    });
  });

  describe('who changed what', () => {
    it('attributes a field edit to its editor and location', async () => {
      const organization = await createOrganization('Edited Org');
      const [location] = organization.Locations;
      const since = await dbNow();

      await updateInstance(EDITOR, location, { name: 'A clearer name' }, {
        metadata: { source: 'gogetta' },
      });

      expect(await editsSince(since)).toEqual([expect.objectContaining({
        resource_table: 'locations',
        resource_id: location.id,
        field_name: 'name',
        last_action_type: 'update',
        previous_value: 'Edited Org location 1',
        replacement_value: 'A clearer name',
        updated_by: EDITOR,
        source: 'gogetta',
        location_ids: [location.id],
        service_id: null,
      })]);
    });

    it('attributes a deleted row to the location it belonged to', async () => {
      // Created without metadata, as older rows were, so only the delete records the link.
      const organization = await createOrganization('Phone Org');
      const [location] = organization.Locations;
      const [phone] = location.Phones;
      const since = await dbNow();

      await destroyInstance(EDITOR, phone);

      expect(await editsSince(since)).toEqual([expect.objectContaining({
        resource_table: 'phones',
        resource_id: phone.id,
        last_action_type: 'delete',
        updated_by: EDITOR,
        location_ids: [location.id],
      })]);
    });

    it('attributes a deleted service to its location', async () => {
      const organization = await createOrganization('Service Delete Org');
      const [location] = organization.Locations;
      const service = await createServiceAt(location, 'Showers');
      const since = await dbNow();

      await deleteService(service.id, EDITOR);

      const edits = await editsSince(since);
      expect(edits).toEqual(expect.arrayContaining([
        expect.objectContaining({
          resource_table: 'services',
          resource_id: service.id,
          last_action_type: 'delete',
          updated_by: EDITOR,
          location_ids: [location.id],
          service_id: service.id,
        }),
        expect.objectContaining({
          resource_table: 'service_at_locations',
          last_action_type: 'delete',
          updated_by: EDITOR,
          location_ids: [location.id],
        }),
      ]));
      expect(await changedIds(since)).toEqual([location.id]);
    });

    it('attributes error reports, filed and deleted, to their location', async () => {
      const organization = await createOrganization('Reported Org');
      const [location] = organization.Locations;
      const since = await dbNow();

      const report = await createInstance(
        EDITOR,
        models.ErrorReport.create.bind(models.ErrorReport),
        { location_id: location.id, content: 'Closed on Mondays now' },
      );
      await destroyInstance(EDITOR, report);

      const edits = (await editsSince(since)).filter(row => row.resource_table === 'error_reports');
      expect(edits.map(edit => edit.last_action_type))
        .toEqual(expect.arrayContaining(['create', 'delete']));
      edits.forEach(edit => expect(edit.location_ids).toEqual([location.id]));
      // A report is not part of the location's detail.
      expect(await changedIds(since)).toEqual([]);
    });

    it('attributes an edit to a service-level row to the service and its locations', async () => {
      const organization = await createOrganization('Eligibility Org', 2);
      const [first, second] = organization.Locations;
      const service = await createServiceAt(first, 'Shared service');
      await second.addService(service);
      const since = await dbNow();

      await createInstance(
        EDITOR,
        models.RequiredDocument.create.bind(models.RequiredDocument),
        { service_id: service.id, document: 'photo ID' },
      );

      const [edit] = (await editsSince(since)).filter(row => row.field_name === 'document');
      expect(edit).toEqual(expect.objectContaining({
        resource_table: 'required_documents',
        updated_by: EDITOR,
        replacement_value: 'photo ID',
        service_id: service.id,
      }));
      expect(edit.location_ids.sort()).toEqual([first.id, second.id].sort());
    });
  });

  describe('access', () => {
    it('answers 401 without verified claims', async () => {
      await request(appWithClaims(null)).get('/location-changes')
        .query({ since: new Date().toISOString() }).expect(401);
    });

    it('answers 403 to a client that is not on the list', async () => {
      await request(appWithClaims({ client_id: 'someone-else' })).get('/location-edits')
        .query({ since: new Date().toISOString() }).expect(403);
    });

    it('answers 403 to everyone while no client is configured', async () => {
      process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = '';
      try {
        await request(feedApp).get('/location-edits')
          .query({ since: new Date().toISOString() }).expect(403);
      } finally {
        process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = CLIENT_ID;
      }
    });

    it('answers 400 to a request without a starting point, or with a bad one', async () => {
      await request(feedApp).get('/location-changes').expect(400);
      await request(feedApp).get('/location-changes').query({ cursor: 'not-a-cursor' })
        .expect(400);
      const impossibleDate = Buffer
        .from('2026-99-99T99:99:99Z|00000000-0000-0000-0000-000000000000')
        .toString('base64');
      await request(feedApp).get('/location-edits').query({ cursor: impossibleDate }).expect(400);
      await request(feedApp).get('/location-edits')
        .query({ since: new Date().toISOString(), limit: 251 }).expect(400);
    });
  });
});
