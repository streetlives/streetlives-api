/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('service null text fields', () => {
  let organization;
  let location;
  let taxonomy;
  let service;

  beforeAll(async () => {
    organization = await models.Organization.create({
      name: 'Null Field Test Org',
    });

    location = await models.Location.create({
      name: 'Null Field Test Location',
      organization_id: organization.id,
    });

    taxonomy = await models.Taxonomy.create({
      name: 'Null Field Test Taxonomy',
    });

    service = await models.Service.create({
      name: 'Existing Service',
      description: 'Existing description',
      additional_info: 'Existing additional info',
      organization_id: organization.id,
    });

    await models.DocumentsInfo.create({
      service_id: service.id,
    });
  });

  it('allows null description and additional info on service updates', async () => {
    await request(app)
      .patch(`/services/${service.id}`)
      .send({
        description: null,
        additionalInfo: null,
      })
      .expect(204);

    const updatedService = await models.Service.findByPk(service.id);
    expect(updatedService.description).toBeNull();
    expect(updatedService.additional_info).toBeNull();
  });

  it('allows null description and additional info on service creation', async () => {
    await request(app)
      .post('/services')
      .send({
        name: 'Created With Null Text',
        locationId: location.id,
        taxonomyId: taxonomy.id,
        description: null,
        additionalInfo: null,
      })
      .expect(201);

    const createdService = await models.Service.findOne({
      where: {
        name: 'Created With Null Text',
        organization_id: organization.id,
      },
      order: [['created_at', 'DESC']],
    });

    expect(createdService).toBeTruthy();
    expect(createdService.description).toBeNull();
    expect(createdService.additional_info).toBeNull();

    const createdDocumentsInfo = await models.DocumentsInfo.findOne({
      where: { service_id: createdService.id },
    });
    expect(createdDocumentsInfo).toBeTruthy();
  });
});
