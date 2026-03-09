/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('update organization', () => {
  let organization;

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

  it('should trim and persist a valid email address', async () => {
    await request(app)
      .patch(`/organizations/${organization.id}`)
      .send({ email: '  updated@streetlives.org  ' })
      .expect(204);

    const updatedOrganization = await models.Organization.findByPk(organization.id);
    expect(updatedOrganization).toHaveProperty('email', 'updated@streetlives.org');
  });

  it('should clear email when updated with a blank string', async () => {
    await request(app)
      .patch(`/organizations/${organization.id}`)
      .send({ email: '   ' })
      .expect(204);

    const updatedOrganization = await models.Organization.findByPk(organization.id);
    expect(updatedOrganization).toHaveProperty('email', null);
  });

  it('should reject an invalid email address', () =>
    request(app)
      .patch(`/organizations/${organization.id}`)
      .send({ email: 'invalid-email' })
      .expect(400));
});
