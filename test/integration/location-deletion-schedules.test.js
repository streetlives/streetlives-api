/**
 * @jest-environment node
 */

import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import app from '../../src/app';
import setupRoutes from '../../src/routes';
import models from '../../src/models';
import { processDueLocationDeletions } from '../../src/services/location-deletions';

const appForProvider = (organizationId) => {
  const providerApp = express();
  providerApp.use(bodyParser.json());
  providerApp.use((req, res, next) => {
    req.apiGateway = {
      event: {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'provider',
              'cognito:groups': ['Providers'],
              'custom:orgs': organizationId,
            },
          },
        },
      },
    };
    next();
  });
  setupRoutes(providerApp);
  return providerApp;
};
const providerApp = appForProvider('00000000-0000-4000-8000-000000000001');

describe('location deletion schedules', () => {
  const sharedServiceError =
    'Cannot schedule deletion for a location with services shared across multiple locations';

  const clearData = async () => {
    await Promise.all([
      models.LocationDeletionSchedule.destroy({ where: {} }),
      models.LocationSlugRedirect.destroy({ where: {} }),
      models.CommentLike.destroy({ where: {} }),
      models.Comment.destroy({ where: {} }),
      models.ErrorReport.destroy({ where: {} }),
      models.Phone.destroy({ where: {} }),
      models.PaymentAccepted.destroy({ where: {} }),
      models.EventRelatedInfo.destroy({ where: {} }),
      models.AccessibilityForDisabilities.destroy({ where: {} }),
      models.RegularSchedule.destroy({ where: {} }),
      models.HolidaySchedule.destroy({ where: {} }),
      models.ServiceArea.destroy({ where: {} }),
      models.Eligibility.destroy({ where: {} }),
      models.ServiceTaxonomySpecificAttribute.destroy({ where: {} }),
      models.RequiredDocument.destroy({ where: {} }),
      models.DocumentsInfo.destroy({ where: {} }),
      models.ServiceLanguages.destroy({ where: {} }),
      models.ServiceTaxonomy.destroy({ where: {} }),
      models.ServiceAtLocation.destroy({ where: {} }),
      models.PhysicalAddress.destroy({ where: {} }),
      models.Metadata.destroy({ where: {} }),
    ]);

    await Promise.all([
      models.Service.destroy({ where: {} }),
      models.Location.destroy({ where: {} }),
      models.Organization.destroy({ where: {} }),
      models.Taxonomy.destroy({ where: {} }),
    ]);
  };

  const createLocationFixture = async ({
    hiddenFromSearch = false,
    includeSecondLocation = false,
    shareServiceAcrossLocations = false,
  } = {}) => {
    const organization = await models.Organization.create(
      {
        name: `Test Org ${Date.now()}`,
        description: 'Organization for location deletion schedule tests.',
        Services: [{
          name: 'Case management',
          ages_served: { min: 18, max: 65 },
          who_does_it_serve: { adults: true },
          Taxonomies: [{
            name: `Taxonomy ${Date.now()}`,
          }],
        }],
        Locations: [
          {
            name: 'Primary location',
            description: 'Primary test location',
            hidden_from_search: hiddenFromSearch,
            PhysicalAddresses: [{
              address_1: '123 Main Street',
              city: 'New York',
              state_province: 'NY',
              postal_code: '10001',
              country: 'United States',
            }],
          },
          ...(includeSecondLocation ? [{
            name: 'Secondary location',
            description: 'Secondary test location',
            PhysicalAddresses: [{
              address_1: '456 Side Street',
              city: 'New York',
              state_province: 'NY',
              postal_code: '10002',
              country: 'United States',
            }],
          }] : []),
        ],
      },
      {
        include: [
          {
            model: models.Service,
            include: [{ model: models.Taxonomy }],
          },
          {
            model: models.Location,
            include: [{ model: models.PhysicalAddress }],
          },
        ],
      },
    );

    const [service] = organization.Services;
    const [location, secondLocation] = organization.Locations;

    await location.addService(service);
    const serviceAtLocation = await models.ServiceAtLocation.findOne({
      where: { service_id: service.id, location_id: location.id },
    });
    if (shareServiceAcrossLocations && secondLocation) {
      await secondLocation.addService(service);
    }

    const [, , , , , , , , locationPhone, locationRegularSchedule,
      locationHolidaySchedule, locationComment] = await Promise.all([
      models.DocumentsInfo.create({
        service_id: service.id,
        recertification_time: '30 days',
        grace_period: '7 days',
        additional_info: 'Bring a photo ID',
      }),
      models.RequiredDocument.create({
        service_id: service.id,
        document: 'Photo ID',
      }),
      models.Phone.create({
        service_id: service.id,
        service_at_location_id: serviceAtLocation.id,
        number: '212-555-1212',
        type: 'voice',
        description: 'Main service line',
      }),
      models.PaymentAccepted.create({
        service_id: service.id,
        payment: 'Medicaid',
      }),
      models.RegularSchedule.create({
        service_id: service.id,
        service_at_location_id: serviceAtLocation.id,
        weekday: 1,
        opens_at: '09:00',
        closes_at: '17:00',
      }),
      models.HolidaySchedule.create({
        service_id: service.id,
        service_at_location_id: serviceAtLocation.id,
        closed: false,
        opens_at: '10:00',
        closes_at: '14:00',
        start_date: '2026-01-01',
        end_date: '2026-01-01',
        occasion: 'HolidayHours',
        freq: 'YEARLY',
        interval: 1,
        bymonthday: '1',
        bymonth: '1',
        valid_from: '2026-01-01',
        valid_to: '2028-01-01',
        description: 'New Year hours',
        exdates: ['2027-01-01'],
      }),
      models.ServiceArea.create({
        service_id: service.id,
        postal_codes: ['10001', '10002'],
        description: 'Downtown Manhattan',
      }),
      models.EventRelatedInfo.create({
        service_id: service.id,
        event: 'COVID19',
        information: 'Masks required',
      }),
      models.Phone.create({
        service_at_location_id: serviceAtLocation.id,
        number: '212-555-3434',
      }),
      models.RegularSchedule.create({
        service_at_location_id: serviceAtLocation.id,
        weekday: 2,
        opens_at: '10:00',
        closes_at: '16:00',
      }),
      models.HolidaySchedule.create({
        service_at_location_id: serviceAtLocation.id,
        closed: true,
        start_date: '2026-12-25',
        end_date: '2026-12-25',
        occasion: 'Christmas',
      }),
      models.Comment.create({
        location_id: location.id,
        service_at_location_id: serviceAtLocation.id,
        content: 'Location-specific feedback',
        posted_by: 'Visitor',
      }),
    ]);

    return {
      organization,
      location,
      secondLocation,
      service,
      locationSpecific: {
        phoneId: locationPhone.id,
        regularScheduleId: locationRegularSchedule.id,
        holidayScheduleId: locationHolidaySchedule.id,
        commentId: locationComment.id,
      },
    };
  };

  beforeEach(clearData);
  afterEach(clearData);

  it('schedules deletion, deletes services immediately, and hides the location', async () => {
    const { location, service } = await createLocationFixture();

    const response = await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Duplicate location entry' })
      .expect(201);

    expect(response.body.note).toBe('Duplicate location entry');
    expect(response.body.requestedBy).toBe('<Anonymous>');
    expect(response.body.deletedServiceCount).toBe(1);
    expect(response.body.location.id).toBe(location.id);

    const scheduledAt = new Date(response.body.scheduledForPermanentDeletionAt).getTime();
    expect(scheduledAt).toBeGreaterThan(Date.now() + (25 * 24 * 60 * 60 * 1000));

    const dbLocation = await models.Location.unscoped().findByPk(location.id);
    expect(dbLocation.hidden_from_search).toBe(true);

    expect(await models.Service.findByPk(service.id)).toBeNull();
    expect(await models.LocationDeletionSchedule.count()).toBe(1);
    const schedule = await models.LocationDeletionSchedule.findOne();
    expect(schedule.service_snapshots).toHaveLength(1);
    expect(schedule.service_snapshots[0].service.name).toBe('Case management');
    expect(schedule.service_snapshots[0].phones).toHaveLength(1);
    expect(schedule.service_snapshots[0].paymentsAccepted).toEqual([{ payment: 'Medicaid' }]);

    const locationInfo = await request(app)
      .get(`/locations/${location.id}`)
      .expect(200);
    expect(locationInfo.body.Services).toHaveLength(0);
  });

  it('lists locations scheduled for deletion with the note and requester', async () => {
    const { location, organization } = await createLocationFixture();

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Organization requested removal' })
      .expect(201);

    const response = await request(app)
      .get('/locations/deletion-schedules')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      note: 'Organization requested removal',
      requestedBy: '<Anonymous>',
      deletedServiceCount: 1,
      location: {
        id: location.id,
        name: 'Primary location',
      },
    });

    const providerResponse = await request(providerApp)
      .get('/locations/deletion-schedules')
      .expect(200);
    expect(providerResponse.body).toEqual([]);

    const ownOrganizationResponse = await request(appForProvider(organization.id))
      .get('/locations/deletion-schedules')
      .expect(200);
    expect(ownOrganizationResponse.body).toHaveLength(1);
  });

  it('restores a scheduled location to its original hidden state', async () => {
    const { location, locationSpecific } = await createLocationFixture();

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Needs to be reviewed before deletion' })
      .expect(201);

    await request(app)
      .delete(`/locations/${location.id}/deletion-schedule`)
      .expect(204);

    const dbLocation = await models.Location.unscoped().findByPk(location.id);
    expect(dbLocation.hidden_from_search).toBe(false);
    expect(await models.LocationDeletionSchedule.count()).toBe(0);

    const restoredService = await models.Service.findOne({
      include: [
        models.Taxonomy,
        models.DocumentsInfo,
        models.RequiredDocument,
        models.Phone,
        models.PaymentAccepted,
        models.RegularSchedule,
        models.HolidaySchedule,
        models.ServiceArea,
        models.EventRelatedInfo,
      ],
    });
    expect(restoredService.name).toBe('Case management');
    expect(restoredService.additional_info).toBeNull();
    expect(restoredService.ages_served).toEqual({ min: 18, max: 65 });
    expect(restoredService.who_does_it_serve).toEqual({ adults: true });
    expect(restoredService.Taxonomies).toHaveLength(1);
    expect(restoredService.DocumentsInfo.recertification_time).toBe('30 days');
    expect(restoredService.RequiredDocuments[0].document).toBe('Photo ID');
    expect(restoredService.Phones[0].number).toBe('212-555-1212');
    expect(restoredService.PaymentAccepteds[0].payment).toBe('Medicaid');
    expect(restoredService.RegularSchedules[0].opens_at).toBe('09:00:00');
    expect(restoredService.HolidaySchedules[0].occasion).toBe('HolidayHours');
    expect(restoredService.HolidaySchedules[0]).toMatchObject({
      freq: 'YEARLY',
      interval: 1,
      bymonthday: '1',
      bymonth: '1',
      valid_from: '2026-01-01',
      valid_to: '2028-01-01',
      description: 'New Year hours',
      exdates: ['2027-01-01'],
    });
    expect(restoredService.ServiceAreas[0].postal_codes).toEqual(['10001', '10002']);
    expect(restoredService.EventRelatedInfos[0].information).toBe('Masks required');

    const restoredLink = await models.ServiceAtLocation.findOne({
      where: { service_id: restoredService.id, location_id: location.id },
    });
    expect(restoredService.Phones[0].service_at_location_id).toBe(restoredLink.id);
    expect(restoredService.RegularSchedules[0].service_at_location_id).toBe(restoredLink.id);
    expect(restoredService.HolidaySchedules[0].service_at_location_id).toBe(restoredLink.id);
    const linkedRows = await Promise.all([
      models.Phone.findByPk(locationSpecific.phoneId),
      models.RegularSchedule.findByPk(locationSpecific.regularScheduleId),
      models.HolidaySchedule.findByPk(locationSpecific.holidayScheduleId),
      models.Comment.findByPk(locationSpecific.commentId),
    ]);
    linkedRows.forEach(row => expect(row.service_at_location_id).toBe(restoredLink.id));
    linkedRows.slice(0, 3).forEach(row => expect(row.service_id).toBeNull());
    expect(await models.Phone.count({ where: { number: '212-555-3434' } })).toBe(1);
    expect(await models.RegularSchedule.count({ where: { weekday: 2 } })).toBe(1);
    expect(await models.HolidaySchedule.count({ where: { occasion: 'Christmas' } })).toBe(1);
  });

  it('keeps an already-hidden location hidden after cancellation', async () => {
    const { location } = await createLocationFixture({ hiddenFromSearch: true });

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Review hidden location' })
      .expect(201);

    const schedule = await models.LocationDeletionSchedule.findOne();
    expect(schedule.was_hidden_from_search).toBe(true);

    await request(app)
      .delete(`/locations/${location.id}/deletion-schedule`)
      .expect(204);

    const restoredLocation = await models.Location.unscoped().findByPk(location.id);
    expect(restoredLocation.hidden_from_search).toBe(true);
  });

  it('permanently removes due locations but leaves future schedules alone', async () => {
    const { location } = await createLocationFixture();

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Duplicate' })
      .expect(201);

    const schedule = await models.LocationDeletionSchedule.findOne();
    const due = new Date(schedule.scheduled_for_permanent_deletion_at.getTime() + 1000);
    expect(await processDueLocationDeletions(new Date())).toBe(0);
    expect(await models.Location.unscoped().findByPk(location.id)).not.toBeNull();

    expect(await processDueLocationDeletions(due)).toBe(1);
    expect(await models.Location.unscoped().findByPk(location.id)).toBeNull();
    expect(await models.LocationDeletionSchedule.count()).toBe(0);
    expect(await processDueLocationDeletions(due)).toBe(0);
  });

  it('rejects a provider outside the location organization on both write routes', async () => {
    const { location, service } = await createLocationFixture();

    await request(providerApp)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Unauthorized' })
      .expect(403);
    expect(await models.Service.findByPk(service.id)).not.toBeNull();

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'Staff decision' })
      .expect(201);
    await request(providerApp)
      .delete(`/locations/${location.id}/deletion-schedule`)
      .expect(403);
    expect(await models.LocationDeletionSchedule.count()).toBe(1);
  });

  it('requires a note when scheduling a deletion', async () => {
    const { location } = await createLocationFixture();

    await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({})
      .expect(400);
  });

  it('rejects scheduling deletion for a location with a shared service', async () => {
    const { location, service } = await createLocationFixture({
      includeSecondLocation: true,
      shareServiceAcrossLocations: true,
    });

    const response = await request(app)
      .post(`/locations/${location.id}/deletion-schedule`)
      .send({ note: 'This should fail because the service is shared' })
      .expect(400);

    expect(response.body.error).toContain(sharedServiceError);

    const dbLocation = await models.Location.unscoped().findByPk(location.id);
    expect(dbLocation.hidden_from_search).toBe(false);
    expect(await models.Service.findByPk(service.id)).not.toBeNull();
    expect(await models.LocationDeletionSchedule.count()).toBe(0);
  });
});
