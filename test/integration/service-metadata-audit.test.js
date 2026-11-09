/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

// Updates that replace a service's rows (hours, languages, documents, ...) delete the old rows in
// bulk. Every one of those deletes has to leave a metadata record, or clearing a field leaves no
// trace in the audit trail and the field's "last updated" date never moves.
describe('service metadata audit', () => {
  let location;
  let service;
  let spanish;
  let english;
  let otherTaxonomy;

  beforeAll(async () => {
    const organization = await models.Organization.create({
      name: 'Audit Test Org',
      Services: [{ name: 'Audited service', Taxonomies: [{ name: 'Food' }] }],
      Locations: [{
        name: 'Audit center',
        PhysicalAddresses: [{
          address_1: '1 Audit Street',
          city: 'New York',
          state_province: 'NY',
          postal_code: '10001',
          country: 'United States',
        }],
      }],
    }, {
      include: [
        { model: models.Service, include: [{ model: models.Taxonomy }] },
        { model: models.Location, include: [{ model: models.PhysicalAddress }] },
      ],
    });
    [location] = organization.Locations;
    [service] = organization.Services;
    await location.setServices([service]);
    // PATCH /services/:id refuses services without a DocumentsInfo row.
    await models.DocumentsInfo.create({ service_id: service.id });
    spanish = await models.Language.create({ language: 'es', name: 'Spanish' });
    english = await models.Language.create({ language: 'en', name: 'English' });
    otherTaxonomy = await models.Taxonomy.create({ name: 'Clothing' });
  });

  const patchService = body => request(app)
    .patch(`/services/${service.id}`)
    .send(body)
    .expect(204);

  const deletesFor = (resourceTable, resourceIds) => models.Metadata.findAll({
    where: {
      resource_table: resourceTable,
      resource_id: resourceIds,
      last_action_type: models.Metadata.actionTypes.delete,
    },
  });

  const serviceFieldDate = async (fieldName) => {
    const res = await request(app).get(`/locations/${location.id}`).expect(200);
    const field = res.body.Services[0].metadata.service
      .find(({ field_name: name }) => name === fieldName);
    return field && new Date(field.last_action_date).toISOString();
  };

  // Seeds rows through the API, clears them, and returns the removed rows' ids.
  const seedThenClear = async (model, seedBody, clearBody, clearedAt) => {
    await patchService(seedBody);
    const seeded = await model.findAll({ where: { service_id: service.id } });
    expect(seeded.length).toBeGreaterThan(0);

    await patchService({ ...clearBody, metadata: { lastUpdated: clearedAt } });
    expect(await model.count({ where: { service_id: service.id } })).toBe(0);
    return seeded.map(({ id }) => id);
  };

  it('records the cleared regular hours and moves the hours date', async () => {
    const clearedAt = '2030-01-01T00:00:00.000Z';
    const removedIds = await seedThenClear(
      models.RegularSchedule,
      { hours: [{ weekday: 'Monday', opensAt: '09:00', closesAt: '17:00' }] },
      { hours: [] },
      clearedAt,
    );

    const deletes = await deletesFor('regular_schedules', removedIds);
    expect(deletes).toHaveLength(removedIds.length);
    deletes.forEach((row) => {
      expect(row.field_name).toBe('service_id');
      expect(row.previous_value).toBe(service.id);
    });
    expect(await serviceFieldDate('hours')).toBe(clearedAt);
  });

  it('records the cleared holiday hours and moves the irregular hours date', async () => {
    const clearedAt = '2030-01-02T00:00:00.000Z';
    const removedIds = await seedThenClear(
      models.HolidaySchedule,
      {
        irregularHours: [{
          closed: true, validFrom: '2026-12-25', validTo: '2026-12-25',
        }],
      },
      { irregularHours: [] },
      clearedAt,
    );

    expect(await deletesFor('holiday_schedules', removedIds)).toHaveLength(removedIds.length);
    expect(await serviceFieldDate('irregularHours')).toBe(clearedAt);
  });

  // Validation rejects an empty languageIds, so languages are only ever replaced.
  it('records the replaced languages', async () => {
    await patchService({ languageIds: [spanish.id] });
    const replaced = await models.ServiceLanguages.findAll({ where: { service_id: service.id } });

    await patchService({ languageIds: [english.id] });

    const deletes = await deletesFor('service_languages', replaced.map(({ id }) => id));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].previous_value).toBe(service.id);
  });

  it('records the cleared required documents', async () => {
    const removedIds = await seedThenClear(
      models.RequiredDocument,
      { documents: { proofs: ['photo ID'] } },
      { documents: { proofs: [] } },
      '2030-01-04T00:00:00.000Z',
    );

    expect(await deletesFor('required_documents', removedIds)).toHaveLength(removedIds.length);
  });

  it('records cleared event information', async () => {
    const removedIds = await seedThenClear(
      models.EventRelatedInfo,
      { eventRelatedInfo: { event: 'COVID19', information: 'Masks required' } },
      { eventRelatedInfo: { event: 'COVID19', information: null } },
      '2030-01-05T00:00:00.000Z',
    );

    expect(await deletesFor('event_related_info', removedIds)).toHaveLength(removedIds.length);
  });

  it('records a category change as a delete and a create', async () => {
    const [previous] = await models.ServiceTaxonomy.findAll({
      where: { service_id: service.id },
    });

    await patchService({ taxonomyId: otherTaxonomy.id });

    const current = await models.ServiceTaxonomy.findAll({ where: { service_id: service.id } });
    expect(current.map(row => row.taxonomy_id)).toEqual([otherTaxonomy.id]);
    expect(await deletesFor('service_taxonomy', [previous.id])).toHaveLength(1);
    const created = await models.Metadata.findAll({
      where: {
        resource_table: 'service_taxonomy',
        resource_id: current[0].id,
        last_action_type: models.Metadata.actionTypes.create,
      },
    });
    expect(created.map(row => row.field_name).sort()).toEqual(['service_id', 'taxonomy_id']);
  });

  it('leaves the category alone when it is set to the current one', async () => {
    const [before] = await models.ServiceTaxonomy.findAll({ where: { service_id: service.id } });

    await patchService({ taxonomyId: before.taxonomy_id });

    const after = await models.ServiceTaxonomy.findAll({ where: { service_id: service.id } });
    expect(after.map(row => row.id)).toEqual([before.id]);
    expect(await deletesFor('service_taxonomy', [before.id])).toHaveLength(0);
  });

  it('records the rows removed along with a deleted service', async () => {
    const doomed = await models.Service.create({
      name: 'Service to delete',
      organization_id: location.organization_id,
    });
    await location.addService(doomed);
    await models.DocumentsInfo.create({ service_id: doomed.id });
    const schedule = await models.RegularSchedule.create({
      service_id: doomed.id, weekday: 1, opens_at: '09:00', closes_at: '17:00',
    });
    const phone = await models.Phone.create({ service_id: doomed.id, number: '212.555.0100' });
    // Cascade-deleted, or left behind with service_id nulled, unless deleted explicitly.
    const language = await models.ServiceLanguages.create({
      service_id: doomed.id, language_id: spanish.id,
    });
    const category = await models.ServiceTaxonomy.create({
      service_id: doomed.id, taxonomy_id: otherTaxonomy.id,
    });
    const eventInfo = await models.EventRelatedInfo.create({
      service_id: doomed.id, event: 'COVID19', information: 'Closed',
    });
    const payment = await models.PaymentAccepted.create({ service_id: doomed.id, payment: 'cash' });

    await request(app).delete(`/services/${doomed.id}`).expect(204);

    expect(await deletesFor('regular_schedules', [schedule.id])).toHaveLength(1);
    expect(await deletesFor('phones', [phone.id])).toHaveLength(1);
    expect(await deletesFor('services', [doomed.id])).toHaveLength(1);
    const unlinkedDeletes = [
      ['service_languages', language],
      ['service_taxonomy', category],
      ['event_related_info', eventInfo],
      ['payments_accepted', payment],
    ];
    for (const [table, row] of unlinkedDeletes) {
      const [deleted] = await deletesFor(table, [row.id]);
      expect(deleted).toEqual(expect.objectContaining({ previous_value: doomed.id }));
    }
    expect(await models.EventRelatedInfo.count({ where: { id: eventInfo.id } })).toBe(0);
    expect(await models.PaymentAccepted.count({ where: { id: payment.id } })).toBe(0);
  });
});
