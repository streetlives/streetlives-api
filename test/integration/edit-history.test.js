/**
 * @jest-environment node
 */

import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import apiApp from '../../src/app';
import models from '../../src/models';
import { buildHistoryUserIdentity } from '../../src/services/edit-history';

describe('edit history', () => {
  const timelineTestName =
    'returns extension-style timeline pages for service description and other info edits';
  const buildAuthenticatedApp = (claims) => {
    const authenticatedApp = express();
    authenticatedApp.use(bodyParser.json());
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
    authenticatedApp.use(apiApp);
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

  const buildFixture = async () => {
    const organization = await models.Organization.create(
      {
        name: 'Edit History Org',
        description: 'Org for edit history tests.',
        url: 'https://example.org',
        Services: [{
          name: 'Testing service',
          description: 'Service description.',
          Taxonomies: [{
            name: 'Shelter',
          }],
        }],
        Locations: [{
          name: 'History test location',
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

    const location = organization.Locations[0];
    const service = organization.Services[0];
    const phone = location.Phones[0];

    await location.setServices([service]);
    await models.DocumentsInfo.create({ service_id: service.id });

    return {
      organization,
      location,
      service,
      phone,
    };
  };

  afterEach(async () => {
    await models.EditHistory.destroy({ where: {} });
  });

  it('records location and organization edits on the location history endpoint', async () => {
    const { organization, location } = await buildFixture();

    await request(apiApp)
      .patch(`/organizations/${organization.id}`)
      .send({ description: 'Updated org description.' })
      .expect(204);

    await request(apiApp)
      .patch(`/locations/${location.id}`)
      .send({
        name: 'Updated location name',
        address: {
          street: '456 Updated Street',
        },
      })
      .expect(204);

    const response = await request(apiApp)
      .get(`/locations/${location.id}/edit-history`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.locationId).toBe(location.id);
    expect(response.body.edits.length).toBeGreaterThanOrEqual(3);
    expect(response.body.edits[0]).toEqual(expect.objectContaining({
      type: 'edit',
      userName: '<Anonymous>',
      pagePath: `/team/location/${location.id}`,
    }));
    expect(response.body.edits.map(edit => edit.resourceTable)).toEqual(expect.arrayContaining([
      'locations',
      'organizations',
    ]));
    expect(response.body.edits.map(edit => edit.label)).toEqual(expect.arrayContaining([
      'Name',
      'Street',
      'Description',
    ]));
  });

  it(timelineTestName, async () => {
    const { location, service } = await buildFixture();

    await request(apiApp)
      .patch(`/services/${service.id}`)
      .send({
        description: 'Updated service description.',
        eventRelatedInfo: {
          event: 'COVID19',
          information: 'Bring a government ID.',
        },
      })
      .expect(204);

    const response = await request(apiApp)
      .get('/locations/edit-history/timeline')
      .query({
        locationId: location.id,
        scope: 'location',
        includeSegments: true,
      })
      .expect(200);

    const descriptionPath = `/team/location/${location.id}/services/${service.id}/description`;
    const otherInfoPath = `/team/location/${location.id}/services/${service.id}/other-info`;
    const descriptionKey = encodeURIComponent(descriptionPath);
    const otherInfoKey = encodeURIComponent(otherInfoPath);

    expect(response.body.ok).toBe(true);
    expect(response.body.scope).toBe('location');
    expect(response.body.pages[descriptionKey]).toBeDefined();
    expect(response.body.pages[otherInfoKey]).toBeDefined();
    expect(response.body.pages[descriptionKey].fieldKey).toBe('services.description');
    expect(response.body.pages[otherInfoKey].fieldKey).toBe('services.additional_info');
    expect(response.body.pages[descriptionKey].events[0]).toEqual(expect.objectContaining({
      label: 'Description',
      pagePath: descriptionPath,
      userName: '<Anonymous>',
    }));
    expect(Array.isArray(response.body.pages[descriptionKey].events[0].segments)).toBe(true);
  });

  it('groups the current user history by page path', async () => {
    const { location, service } = await buildFixture();

    await request(apiApp)
      .patch(`/locations/${location.id}`)
      .send({ description: 'Refreshed location description.' })
      .expect(204);

    await request(apiApp)
      .patch(`/services/${service.id}`)
      .send({ description: 'Refreshed service description.' })
      .expect(204);

    const response = await request(apiApp)
      .get('/locations/edit-history/user')
      .expect(200);

    const locationPath = `/team/location/${location.id}`;
    const descriptionPath = `/team/location/${location.id}/services/${service.id}/description`;

    expect(response.body.user).toEqual(expect.objectContaining({
      key: '<Anonymous>',
      name: '<Anonymous>',
    }));
    expect(response.body.data[locationPath]).toBeDefined();
    expect(response.body.data[descriptionPath]).toBeDefined();
    expect(Object.values(response.body.data[descriptionPath])[0]).toEqual(expect.objectContaining({
      userName: '<Anonymous>',
      label: 'Description',
      pagePath: descriptionPath,
    }));
  });

  it('rejects unsupported timeline scopes', async () => {
    const { location } = await buildFixture();

    await request(apiApp)
      .get('/locations/edit-history/timeline')
      .query({
        locationId: location.id,
        scope: 'page',
      })
      .expect(400);
  });

  it('rejects unauthenticated edit history endpoints outside test mode', async () => {
    const { location } = await buildFixture();

    await runAsProduction(async () => {
      await request(apiApp)
        .get(`/locations/${location.id}/edit-history`)
        .expect(401);

      await request(apiApp)
        .get('/locations/edit-history/timeline')
        .query({
          locationId: location.id,
          scope: 'location',
        })
        .expect(401);

      await request(apiApp)
        .get('/locations/edit-history/user')
        .expect(401);
    });
  });

  it('restricts location history reads to matching organizations outside test mode', async () => {
    const { organization, location } = await buildFixture();
    const authorizedClaims = {
      sub: randomUUID(),
      'cognito:username': 'authorized-editor',
      'custom:orgs': organization.id,
    };
    const unauthorizedClaims = {
      sub: randomUUID(),
      'cognito:username': 'unauthorized-editor',
      'custom:orgs': randomUUID(),
    };

    await runAsProduction(async () => {
      await request(buildAuthenticatedApp(authorizedClaims))
        .get(`/locations/${location.id}/edit-history`)
        .expect(200);

      await request(buildAuthenticatedApp(authorizedClaims))
        .get('/locations/edit-history/timeline')
        .query({
          locationId: location.id,
          scope: 'location',
        })
        .expect(200);

      await request(buildAuthenticatedApp(unauthorizedClaims))
        .get(`/locations/${location.id}/edit-history`)
        .expect(403);

      await request(buildAuthenticatedApp(unauthorizedClaims))
        .get('/locations/edit-history/timeline')
        .query({
          locationId: location.id,
          scope: 'location',
        })
        .expect(403);
    });
  });

  it('keeps email-based Cognito identities isolated in current user history', async () => {
    const locationId = randomUUID();
    const otherLocationId = randomUUID();
    const claims = {
      sub: randomUUID(),
      'cognito:username': 'editor@example.org',
    };
    const otherClaims = {
      sub: randomUUID(),
      'cognito:username': 'other@example.org',
    };
    const identity = buildHistoryUserIdentity({
      userKey: claims.sub,
      userName: claims['cognito:username'],
    });
    const otherIdentity = buildHistoryUserIdentity({
      userKey: otherClaims.sub,
      userName: otherClaims['cognito:username'],
    });

    await models.EditHistory.bulkCreate([
      {
        location_id: locationId,
        page_path: `/team/location/${locationId}`,
        user_key: identity.key,
        user_name: identity.displayName,
        action: 'update',
        field: 'description',
        label: 'Description',
        before_value: 'Before',
        after_value: 'After',
        summary: 'Updated Description',
        resource_table: 'locations',
        resource_id: locationId,
        source: 'location-api',
        action_at: new Date(),
        copyedit: false,
      },
      {
        location_id: otherLocationId,
        page_path: `/team/location/${otherLocationId}`,
        user_key: otherIdentity.key,
        user_name: otherIdentity.displayName,
        action: 'update',
        field: 'description',
        label: 'Description',
        before_value: 'Before',
        after_value: 'After',
        summary: 'Updated Description',
        resource_table: 'locations',
        resource_id: otherLocationId,
        source: 'location-api',
        action_at: new Date(),
        copyedit: false,
      },
    ]);

    const response = await request(buildAuthenticatedApp(claims))
      .get('/locations/edit-history/user')
      .expect(200);

    expect(response.body.user).toEqual(expect.objectContaining({
      key: identity.displayName,
      name: identity.displayName,
    }));
    expect(response.body.user.name).not.toBe('Unknown');
    expect(response.body.data[`/team/location/${locationId}`]).toBeDefined();
    expect(response.body.data[`/team/location/${otherLocationId}`]).toBeUndefined();
    expect(Object.values(response.body.data[`/team/location/${locationId}`])[0])
      .toEqual(expect.objectContaining({
        userName: identity.displayName,
        pagePath: `/team/location/${locationId}`,
      }));
  });

  it('filters current user history to the caller organizations outside test mode', async () => {
    const allowedFixture = await buildFixture();
    const otherFixture = await buildFixture();
    const claims = {
      sub: randomUUID(),
      'cognito:username': 'org-scoped-editor',
      'custom:orgs': allowedFixture.organization.id,
    };
    const identity = buildHistoryUserIdentity({
      userKey: claims.sub,
      userName: claims['cognito:username'],
    });

    await models.EditHistory.bulkCreate([
      {
        location_id: allowedFixture.location.id,
        page_path: `/team/location/${allowedFixture.location.id}`,
        user_key: identity.key,
        user_name: identity.displayName,
        action: 'update',
        field: 'description',
        label: 'Description',
        before_value: null,
        after_value: null,
        summary: 'Updated Description',
        resource_table: 'locations',
        resource_id: allowedFixture.location.id,
        source: 'location-api',
        action_at: new Date(),
        copyedit: false,
      },
      {
        location_id: otherFixture.location.id,
        page_path: `/team/location/${otherFixture.location.id}`,
        user_key: identity.key,
        user_name: identity.displayName,
        action: 'update',
        field: 'description',
        label: 'Description',
        before_value: null,
        after_value: null,
        summary: 'Updated Description',
        resource_table: 'locations',
        resource_id: otherFixture.location.id,
        source: 'location-api',
        action_at: new Date(),
        copyedit: false,
      },
    ]);

    await runAsProduction(async () => {
      const response = await request(buildAuthenticatedApp(claims))
        .get('/locations/edit-history/user')
        .expect(200);

      expect(response.body.data[`/team/location/${allowedFixture.location.id}`]).toBeDefined();
      expect(response.body.data[`/team/location/${otherFixture.location.id}`]).toBeUndefined();
    });
  });

  it('redacts raw before and after values for non-playback edits', async () => {
    const { location } = await buildFixture();

    await request(apiApp)
      .patch(`/locations/${location.id}`)
      .send({ name: 'Redacted history name' })
      .expect(204);

    const response = await request(apiApp)
      .get(`/locations/${location.id}/edit-history`)
      .expect(200);

    const nameEdit = response.body.edits.find(edit => edit.label === 'Name');
    expect(nameEdit).toEqual(expect.objectContaining({
      summary: 'Updated Name',
    }));
    expect(nameEdit.before).toBeUndefined();
    expect(nameEdit.after).toBeUndefined();
  });

  it('still updates a location when history recording fails', async () => {
    const { location } = await buildFixture();
    const bulkCreateSpy = jest.spyOn(models.EditHistory, 'bulkCreate')
      .mockRejectedValueOnce(new Error('history write failed'));

    await request(apiApp)
      .patch(`/locations/${location.id}`)
      .send({ description: 'Location saved despite history failure.' })
      .expect(204);

    bulkCreateSpy.mockRestore();

    const updatedLocation = await models.Location.findByPk(location.id);
    expect(updatedLocation.description).toBe('Location saved despite history failure.');
  });

  it('still creates a location when history recording fails', async () => {
    const organization = await models.Organization.create({
      name: 'Create History Org',
      description: 'Org for create history failure tests.',
      url: 'https://example.org/create',
    });
    const bulkCreateSpy = jest.spyOn(models.EditHistory, 'bulkCreate')
      .mockRejectedValueOnce(new Error('history write failed'));

    const response = await request(apiApp)
      .post('/locations')
      .send({
        name: 'Created despite history failure',
        description: 'Created description.',
        latitude: 40.7128,
        longitude: -74.0060,
        organizationId: organization.id,
        address: {
          street: '789 Recovery Avenue',
          city: 'New York',
          state: 'NY',
          postalCode: '10002',
          country: 'United States',
        },
      })
      .expect(201);

    bulkCreateSpy.mockRestore();

    const createdLocation = await models.Location.findByPk(response.body.id);
    expect(createdLocation.name).toBe('Created despite history failure');
  });
});
