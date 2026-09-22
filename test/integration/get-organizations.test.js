/**
 * @jest-environment node
 */

import express from 'express';
import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('get organizations', () => {
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
      name: 'Organization With Email',
      description: 'An organization used to test public/private payloads.',
      email: 'contact@streetlives.org',
      url: 'www.streetlives.com',
    });
  });

  afterEach(() => models.Organization.destroy({ where: {} }));

  it('should not expose email in the public organizations list', async () => {
    const res = await request(app)
      .get('/organizations')
      .expect(200);

    const returnedOrganization = res.body.find(org => org.id === organization.id);
    expect(returnedOrganization).toBeDefined();
    expect(returnedOrganization).not.toHaveProperty('email');
  });

  it('should return 401 when no authenticated user is present in production', () =>
    request(buildProductionApp())
      .get(`/organizations/${organization.id}`)
      .expect(401));

  it('should return 403 when an anonymous test user fetches a specific organization', () =>
    request(app)
      .get(`/organizations/${organization.id}`)
      .expect(403));

  it('should return 403 when the authenticated user is not authorized for the organization', () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': '11111111-1111-1111-1111-111111111111',
    });

    return request(appWithClaims)
      .get(`/organizations/${organization.id}`)
      .expect(403);
  });

  it('should return email for an organization member', async () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'user-id',
      'custom:orgs': organization.id,
    });

    const res = await request(appWithClaims)
      .get(`/organizations/${organization.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('email', organization.email);
  });

  it('should return email when fetching a specific organization as an admin', async () => {
    const appWithClaims = buildAppWithClaims({
      sub: 'admin-id',
      'cognito:groups': 'StreetlivesAdmins',
    });

    const res = await request(appWithClaims)
      .get(`/organizations/${organization.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('email', organization.email);
  });
});
