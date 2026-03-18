/**
 * @jest-environment node
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import express from 'express';
import locations from '../../src/controllers/locations';
import models from '../../src/models';
import getUser from '../../src/middleware/get-user';

describe('location changes feed', () => {
  const app = express();
  const buildAuthenticatedChangesApp = (claims) => {
    const authenticatedApp = express();
    authenticatedApp.use((req, res, next) => {
      req.apiGateway = {
        event: {
          requestContext: {
            authorizer: { claims },
          },
        },
      };
      next();
    });
    authenticatedApp.use(app);
    return authenticatedApp;
  };
  const runAsProduction = async (callback) => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await callback();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  };
  let organization;
  let location;
  let service;
  let phone;

  beforeAll(() => {
    app.get('/locations/changes', getUser, locations.getChanges);
    app.delete('/phones/:phoneId', (req, res, next) => {
      req.user = '<Anonymous>';
      req.userName = '<Anonymous>';
      next();
    }, locations.deletePhone);
    app.use((err, req, res, next) => {
      if (res.headersSent) {
        return next(err);
      }

      return res.status(500).send({ error: err.stack });
    });
  });

  beforeAll(async () => {
    organization = await models.Organization.create(
      {
        name: 'Changes Test Org',
        description: 'Org for location change feed tests.',
        url: 'https://example.org',
        Services: [{
          name: 'Testing service',
          description: 'Service description.',
          Taxonomies: [{
            name: 'Shelter',
          }],
        }],
        Locations: [{
          name: 'Feed test location',
          description: 'Location description.',
          hidden_from_search: true,
          PhysicalAddresses: [{
            address_1: '123 Test Street',
            city: 'New York',
            state_province: 'NY',
            postal_code: '10001',
            country: 'United States',
          }],
          Phones: [{
            number: '2125550101',
          }],
        }],
      },
      {
        include: [
          { model: models.Service, include: [{ model: models.Taxonomy }] },
          {
            model: models.Location,
            include: [
              { model: models.PhysicalAddress },
              { model: models.Phone },
            ],
          },
        ],
      },
    );

    [location] = organization.Locations;
    [service] = organization.Services;
    [phone] = location.Phones;

    await location.setServices([service]);
  });

  it('resolves organization, service, and phone edits back to affected location ids', async () => {
    const now = new Date();
    const metadataDate = new Date(now.getTime() - (60 * 1000));

    await models.Metadata.bulkCreate([
      {
        resource_table: 'organizations',
        resource_id: organization.id,
        last_action_date: metadataDate,
        last_action_type: models.Metadata.actionTypes.update,
        field_name: 'name',
        replacement_value: 'Changes Test Org Updated',
        createdAt: new Date(metadataDate.getTime() + 1000),
        updatedAt: new Date(metadataDate.getTime() + 1000),
      },
      {
        resource_table: 'phones',
        resource_id: phone.id,
        last_action_date: metadataDate,
        last_action_type: models.Metadata.actionTypes.update,
        field_name: 'number',
        replacement_value: '2125550199',
        createdAt: new Date(metadataDate.getTime() + 2000),
        updatedAt: new Date(metadataDate.getTime() + 2000),
      },
      {
        resource_table: 'services',
        resource_id: service.id,
        last_action_date: metadataDate,
        last_action_type: models.Metadata.actionTypes.update,
        field_name: 'description',
        replacement_value: 'Updated service description.',
        createdAt: new Date(metadataDate.getTime() + 3000),
        updatedAt: new Date(metadataDate.getTime() + 3000),
      },
    ]);

    const response = await request(app)
      .get('/locations/changes')
      .query({ since: new Date(metadataDate.getTime() - 1000).toISOString() })
      .expect(200);

    expect(response.body.locationIds).toEqual([location.id]);
    expect(response.body.changes).toHaveLength(3);
    expect(response.body.changes.map(change => change.resourceTable)).toEqual([
      'organizations',
      'phones',
      'services',
    ]);
    expect(typeof response.body.nextCursor).toBe('string');
  });

  it('returns an empty bootstrap response when no cursor or since is provided', async () => {
    const response = await request(app)
      .get('/locations/changes')
      .expect(200);

    expect(response.body.changes).toEqual([]);
    expect(response.body.locationIds).toEqual([]);
    expect(typeof response.body.nextCursor).toBe('string');
  });

  it('emits location ids for deleted phones', async () => {
    const deletedPhoneId = phone.id;
    const deleteStartedAt = new Date();

    await request(app)
      .delete(`/phones/${deletedPhoneId}`)
      .expect(204);

    const response = await request(app)
      .get('/locations/changes')
      .query({ since: new Date(deleteStartedAt.getTime() - 1000).toISOString() })
      .expect(200);

    expect(response.body.locationIds).toEqual(expect.arrayContaining([location.id]));
    expect(response.body.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: location.id,
        resourceTable: 'phones',
        resourceId: deletedPhoneId,
        actionType: 'delete',
      }),
    ]));
  });

  it('rejects unauthenticated access to the changes feed outside test mode', async () => {
    await runAsProduction(async () => {
      await request(app)
        .get('/locations/changes')
        .expect(401);
    });
  });

  it('filters the changes feed to the caller organizations outside test mode', async () => {
    const metadataDate = new Date(Date.now() - (60 * 1000));
    const claims = {
      sub: randomUUID(),
      'cognito:username': 'authorized-editor',
      'custom:orgs': organization.id,
    };
    const otherClaims = {
      sub: randomUUID(),
      'cognito:username': 'other-editor',
      'custom:orgs': randomUUID(),
    };

    await models.Metadata.create({
      resource_table: 'organizations',
      resource_id: organization.id,
      last_action_date: metadataDate,
      last_action_type: models.Metadata.actionTypes.update,
      field_name: 'name',
      replacement_value: 'Scoped Changes Test Org',
      createdAt: new Date(metadataDate.getTime() + 1000),
      updatedAt: new Date(metadataDate.getTime() + 1000),
    });

    await runAsProduction(async () => {
      const authorizedResponse = await request(buildAuthenticatedChangesApp(claims))
        .get('/locations/changes')
        .query({ since: new Date(metadataDate.getTime() - 1000).toISOString() })
        .expect(200);

      expect(authorizedResponse.body.locationIds).toEqual(expect.arrayContaining([location.id]));
      expect(authorizedResponse.body.changes.length).toBeGreaterThan(0);

      const unauthorizedResponse = await request(buildAuthenticatedChangesApp(otherClaims))
        .get('/locations/changes')
        .query({ since: new Date(metadataDate.getTime() - 1000).toISOString() })
        .expect(200);

      expect(unauthorizedResponse.body.locationIds).toEqual([]);
      expect(unauthorizedResponse.body.changes).toEqual([]);
    });
  });
});
