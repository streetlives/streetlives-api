/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('edit history', () => {
  const timelineTestName =
    'returns extension-style timeline pages for service description and other info edits';

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

    await request(app)
      .patch(`/organizations/${organization.id}`)
      .send({ description: 'Updated org description.' })
      .expect(204);

    await request(app)
      .patch(`/locations/${location.id}`)
      .send({
        name: 'Updated location name',
        address: {
          street: '456 Updated Street',
        },
      })
      .expect(204);

    const response = await request(app)
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

    await request(app)
      .patch(`/services/${service.id}`)
      .send({
        description: 'Updated service description.',
        eventRelatedInfo: {
          event: 'COVID19',
          information: 'Bring a government ID.',
        },
      })
      .expect(204);

    const response = await request(app)
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

    await request(app)
      .patch(`/locations/${location.id}`)
      .send({ description: 'Refreshed location description.' })
      .expect(204);

    await request(app)
      .patch(`/services/${service.id}`)
      .send({ description: 'Refreshed service description.' })
      .expect(204);

    const response = await request(app)
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
});
