/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('scheduled actions', () => {
  let organization;
  let location;
  let service;
  let address;

  const clearData = async () => {
    await models.ScheduledAction.destroy({ where: {} });
    await models.Metadata.destroy({ where: {} });
    await models.ServiceAtLocation.destroy({ where: {} });
    await models.DocumentsInfo.destroy({ where: {} });
    await models.ServiceTaxonomy.destroy({ where: {} });
    await models.Taxonomy.destroy({ where: {} });
    await models.Service.destroy({ where: {} });
    await models.PhysicalAddress.destroy({ where: {} });
    await models.Location.destroy({ where: {} });
    await models.Organization.destroy({ where: {} });
  };

  const setupData = async () => {
    await clearData();

    organization = await models.Organization.create({
      name: 'Scheduled Action Org',
      description: 'An organization meant for scheduled action tests.',
    });
    location = await models.Location.create({
      name: 'Scheduled Action Location',
      organization_id: organization.id,
    });
    address = await models.PhysicalAddress.create({
      location_id: location.id,
      address_1: '123 Test St.',
      city: 'New York',
      state_province: 'NY',
      postal_code: '10001',
      country: 'US',
    });
    service = await models.Service.create({
      name: 'Original Service Name',
      organization_id: organization.id,
    });
    await models.DocumentsInfo.create({ service_id: service.id });
    await location.addService(service);
  };

  beforeEach(setupData);
  afterAll(clearData);

  it('should run a due scheduled service patch', async () => {
    await request(app)
      .post('/scheduled-patches')
      .send({
        resource: 'services',
        resourceId: service.id,
        runAt: new Date().toISOString(),
        payload: {
          name: 'Updated Service Name',
        },
        changedFields: ['name'],
      })
      .expect(201);

    const runResult = await request(app)
      .post('/scheduled-actions/run-due')
      .send({ limit: 10 })
      .expect(200);

    expect(runResult.body.processed).toBe(1);
    expect(runResult.body.results[0]).toHaveProperty('status', 'completed');

    const updatedService = await models.Service.findByPk(service.id);
    expect(updatedService).toHaveProperty('name', 'Updated Service Name');

    const scheduledAction = await models.ScheduledAction.findOne({
      where: { resource_id: service.id },
    });
    expect(scheduledAction).toHaveProperty('status', 'completed');
  });

  it('should run a due scheduled physical address patch', async () => {
    await request(app)
      .post('/scheduled-patches')
      .send({
        resource: 'physical_addresses',
        resourceId: address.id,
        runAt: new Date().toISOString(),
        payload: {
          city: 'Brooklyn',
          postalCode: '11201',
        },
        changedFields: ['city', 'postal_code'],
      })
      .expect(201);

    await request(app)
      .post('/scheduled-actions/run-due')
      .send({ limit: 10 })
      .expect(200);

    const updatedAddress = await models.PhysicalAddress.findByPk(address.id);
    expect(updatedAddress).toHaveProperty('city', 'Brooklyn');
    expect(updatedAddress).toHaveProperty('postal_code', '11201');
  });

  it('should run a due scheduled service deletion', async () => {
    await request(app)
      .post('/scheduled-deletions')
      .send({
        resource: 'services',
        resourceId: service.id,
        runAt: new Date().toISOString(),
      })
      .expect(201);

    const runResult = await request(app)
      .post('/scheduled-actions/run-due')
      .send({ limit: 10 })
      .expect(200);

    expect(runResult.body.processed).toBe(1);
    expect(runResult.body.results[0]).toHaveProperty('status', 'completed');

    const deletedService = await models.Service.findByPk(service.id);
    expect(deletedService).toBeNull();
  });
});
