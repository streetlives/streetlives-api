/**
 * @jest-environment node
 */

import express from 'express';
import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('update organization', () => {
  let organization;

  const buildAppWithClaims = (claims) => {
    const appWithClaims = express();
    appWithClaims.use((req, res, next) => {
      req.apiGateway = {
        event: {
          requestContext: {
            authorizer: {
              claims,
            },
          },
        },
      };
      next();
    });
    appWithClaims.use(app);
    return appWithClaims;
  };

  const buildProductionApp = () => {
    let productionApp;
    const originalNodeEnv = process.env.NODE_ENV;

    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      productionApp = require('../../src/app').default; // eslint-disable-line global-require
    });

    process.env.NODE_ENV = originalNodeEnv;
    return productionApp;
  };

  beforeEach(async () => {
    organization = await models.Organization.create({
      name: 'Existing Org',
      description: 'An organization for update tests.',
      email: 'existing@streetlives.org',
      url: 'www.streetlives.com',
    });
  });

  afterEach(() => Promise.all([
    models.Organization.destroy({ where: {} }),
    models.Metadata.destroy({ where: {} }),
  ]));

  it('should return 401 when no authenticated user is present in production', () =>
    request(buildProductionApp())
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'updated@streetlives.org' })
      .expect(401));

  it('should return 403 when an anonymous test user updates a specific organization', () =>
    request(app)
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'updated@streetlives.org' })
      .expect(403));

  it('should return 403 when the authenticated user is not authorized for the organization', () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': '11111111-1111-1111-1111-111111111111',
    });

    return request(appWithClaims)
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'updated@streetlives.org' })
      .expect(403);
  });

  it('should trim and persist a valid email address for an organization member', async () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': organization.id,
    });

    await request(appWithClaims)
      .patch(`/organizations/${organization.id}`)
      .send({ email: '  updated@streetlives.org  ' })
      .expect(204);

    const updatedOrganization = await models.Organization.findByPk(organization.id);
    expect(updatedOrganization).toHaveProperty('email', 'updated@streetlives.org');
  });

  it('should allow admins to update organization email', async () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'admin-id',
      'cognito:groups': 'StreetlivesAdmins',
    });

    await request(appWithClaims)
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'admin-updated@streetlives.org' })
      .expect(204);

    const updatedOrganization = await models.Organization.findByPk(organization.id);
    expect(updatedOrganization).toHaveProperty('email', 'admin-updated@streetlives.org');
  });

  it('should clear email when updated with a blank string by an organization member', async () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': organization.id,
    });

    await request(appWithClaims)
      .patch(`/organizations/${organization.id}`)
      .send({ email: '   ' })
      .expect(204);

    const updatedOrganization = await models.Organization.findByPk(organization.id);
    expect(updatedOrganization).toHaveProperty('email', null);
  });

  it('should reject an invalid email address for an authorized organization member', () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': organization.id,
    });

    return request(appWithClaims)
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'invalid-email' })
      .expect(400);
  });
});
