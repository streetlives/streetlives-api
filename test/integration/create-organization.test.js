/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('create organization', () => {
  const orgParams = {
    name: 'New Org',
    description: 'An organization created through an API request.',
    url: 'www.streetlives.com',
  };

  afterEach(() => Promise.all([
    models.Organization.destroy({ where: {} }),
    models.Metadata.destroy({ where: {} }),
  ]));

  it('should create an organization in the DB', async () => {
    await request(app)
      .post('/organizations')
      .send(orgParams)
      .expect(201);

    const dbOrg = await models.Organization.findOne({ name: orgParams.name });
    expect(dbOrg).toHaveProperty('description', orgParams.description);
    expect(dbOrg).toHaveProperty('url', orgParams.url);
  });

  describe('when no custom metadata is specified', () => {
    it('should create metadata with current time as the last action date', async () => {
      const startTime = Date.now();
      await request(app)
        .post('/organizations')
        .send(orgParams)
        .expect(201);
      const endTime = Date.now();

      const dbOrg = await models.Organization.findOne({ name: orgParams.name });
      const latestUpdate = await models.Metadata.getLatestUpdateDateForResource(dbOrg.id);

      const latestUpdateTime = latestUpdate.getTime();
      expect(latestUpdateTime).toBeGreaterThanOrEqual(startTime);
      expect(latestUpdateTime).toBeLessThanOrEqual(endTime);
    });
  });

  describe('when custom metadata is specified', () => {
    it('should create metadata based on the parameters specified', async () => {
      const customLastUpdated = new Date('2020-01-01T20:10:00');
      await request(app)
        .post('/organizations')
        .send({ ...orgParams, metadata: { lastUpdated: customLastUpdated } })
        .expect(201);

      const dbOrg = await models.Organization.findOne({ name: orgParams.name });
      const latestUpdate = await models.Metadata.getLatestUpdateDateForResource(dbOrg.id);
      expect(latestUpdate).toEqual(customLastUpdated);
    });
  });
});
