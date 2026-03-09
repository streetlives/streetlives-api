/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('get organizations', () => {
  let organization;

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

  it('should return email when fetching a specific organization', async () => {
    const res = await request(app)
      .get(`/organizations/${organization.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('email', organization.email);
  });
});
