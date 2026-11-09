import { Op } from 'sequelize';
import models from '../models';
import { createInstance, destroyInstance, updateInstance } from './data-changes';
import { deleteService } from './services';
import { NotFoundError, ValidationError } from '../utils/errors';

const { sequelize } = models;
const SHARED_SERVICE_DELETION_ERROR =
  'Cannot schedule deletion for a location with services shared across multiple locations';
const snapshotServiceIncludes = [
  {
    model: models.Location,
    attributes: ['id'],
  },
  models.Taxonomy,
  models.Language,
  models.RequiredDocument,
  models.DocumentsInfo,
  {
    model: models.Eligibility,
    include: [models.EligibilityParameter],
  },
  {
    model: models.ServiceTaxonomySpecificAttribute,
    include: [{
      model: models.TaxonomySpecificAttribute,
      as: 'attribute',
    }],
  },
  models.RegularSchedule,
  models.HolidaySchedule,
  models.Phone,
  models.PaymentAccepted,
  models.EventRelatedInfo,
  models.ServiceArea,
];

const addOneMonth = (date) => {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate;
};

export const serializeLocationDeletionSchedule = (scheduleInstance) => {
  const schedule = scheduleInstance.get
    ? scheduleInstance.get({ plain: true })
    : scheduleInstance;
  const location = schedule.Location || {};
  const organization = location.Organization || {};

  return {
    id: schedule.id,
    note: schedule.note,
    requestedBy: schedule.requested_by,
    deletedServiceCount: schedule.deleted_service_count,
    scheduledForPermanentDeletionAt: schedule.scheduled_for_permanent_deletion_at,
    createdAt: schedule.created_at,
    location: {
      id: location.id,
      name: location.name,
      slug: location.slug,
    },
    organization: {
      id: organization.id,
      name: organization.name,
    },
  };
};

const getLocationForDeletion = (locationId, transaction) => models.Location.unscoped().findByPk(
  locationId,
  {
    include: [
      models.Organization,
      {
        model: models.Service,
        include: snapshotServiceIncludes,
      },
    ],
    transaction,
  },
);

const getScheduleWithLocation = (locationId, transaction) =>
  models.LocationDeletionSchedule.findOne({
    where: { location_id: locationId },
    include: [{
      model: models.Location,
      include: [models.Organization],
    }],
    transaction,
  });

const assertServicesAreExclusiveToLocation = (location) => {
  const sharedServices = location.Services.filter(service =>
    service.Locations.some(serviceLocation => serviceLocation.id !== location.id));

  if (sharedServices.length) {
    throw new ValidationError(SHARED_SERVICE_DELETION_ERROR);
  }
};

const createServiceSnapshot = async (service, locationId, transaction) => {
  const plainService = service.get({ plain: true });
  const locationLink =
    plainService.Locations.find(serviceLocation => serviceLocation.id === locationId);
  const linkId = locationLink && locationLink.ServiceAtLocation &&
    locationLink.ServiceAtLocation.id;
  const linkedIds = async (model) => {
    if (!linkId) return [];
    const rows = await model.findAll({
      attributes: ['id', ...(model === models.Comment ? [] : ['service_id'])],
      where: { service_at_location_id: linkId },
      transaction,
    });
    return rows.filter(row => model === models.Comment || !row.service_id)
      .map(row => row.id);
  };
  const [phoneIds, regularScheduleIds, holidayScheduleIds, commentIds] = await Promise.all([
    linkedIds(models.Phone),
    linkedIds(models.RegularSchedule),
    linkedIds(models.HolidaySchedule),
    linkedIds(models.Comment),
  ]);

  return {
    service: {
      name: plainService.name,
      description: plainService.description,
      url: plainService.url,
      email: plainService.email,
      interpretation_services: plainService.interpretation_services,
      fees: plainService.fees,
      additional_info: plainService.additional_info,
      ages_served: plainService.ages_served,
      who_does_it_serve: plainService.who_does_it_serve,
    },
    serviceAtLocation: locationLink && locationLink.ServiceAtLocation
      ? {
        description: locationLink.ServiceAtLocation.description,
        phoneIds,
        regularScheduleIds,
        holidayScheduleIds,
        commentIds,
      }
      : null,
    taxonomies: plainService.Taxonomies.map(({ id }) => ({ taxonomy_id: id })),
    languages: plainService.Languages.map(({ id }) => ({ language_id: id })),
    documentsInfo: plainService.DocumentsInfo
      ? {
        recertification_time: plainService.DocumentsInfo.recertification_time,
        grace_period: plainService.DocumentsInfo.grace_period,
        additional_info: plainService.DocumentsInfo.additional_info,
      }
      : null,
    requiredDocuments: plainService.RequiredDocuments.map(({ document }) => ({ document })),
    eligibilities: plainService.Eligibilities.map(eligibility => ({
      parameter_id: eligibility.parameter_id,
      description: eligibility.description,
      eligible_values: eligibility.eligible_values,
    })),
    taxonomySpecificAttributes: plainService.ServiceTaxonomySpecificAttributes.map(attribute => ({
      attribute_id: attribute.attribute_id,
      values: attribute.values,
    })),
    regularSchedules: plainService.RegularSchedules.map(schedule => ({
      weekday: schedule.weekday,
      opens_at: schedule.opens_at,
      closes_at: schedule.closes_at,
      location_id: schedule.location_id,
      atLocation: schedule.service_at_location_id === linkId,
    })),
    holidaySchedules: plainService.HolidaySchedules.map(schedule => ({
      closed: schedule.closed,
      opens_at: schedule.opens_at,
      closes_at: schedule.closes_at,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      weekday: schedule.weekday,
      occasion: schedule.occasion,
      freq: schedule.freq,
      interval: schedule.interval,
      byday: schedule.byday,
      bymonthday: schedule.bymonthday,
      bymonth: schedule.bymonth,
      valid_from: schedule.valid_from,
      valid_to: schedule.valid_to,
      description: schedule.description,
      exdates: schedule.exdates,
      location_id: schedule.location_id,
      atLocation: schedule.service_at_location_id === linkId,
    })),
    phones: plainService.Phones.map(phone => ({
      number: phone.number,
      extension: phone.extension,
      type: phone.type,
      language: phone.language,
      description: phone.description,
      location_id: phone.location_id,
      atLocation: phone.service_at_location_id === linkId,
    })),
    paymentsAccepted: plainService.PaymentAccepteds.map(({ payment }) => ({ payment })),
    eventRelatedInfos: plainService.EventRelatedInfos.map(info => ({
      event: info.event,
      information: info.information,
      location_id: info.location_id,
    })),
    serviceAreas: plainService.ServiceAreas.map(area => ({
      postal_codes: area.postal_codes,
      description: area.description,
    })),
  };
};

const restoreServiceSnapshot = async (location, serviceSnapshot, user, transaction) => {
  const restoredService = await createInstance(
    user,
    models.Service.create.bind(models.Service),
    {
      ...serviceSnapshot.service,
      organization_id: location.organization_id,
    },
    { transaction },
  );

  const restoredLink = await createInstance(
    user,
    models.ServiceAtLocation.create.bind(models.ServiceAtLocation),
    {
      service_id: restoredService.id,
      location_id: location.id,
      description: serviceSnapshot.serviceAtLocation &&
        serviceSnapshot.serviceAtLocation.description,
    },
    { transaction },
  );

  await Promise.all(serviceSnapshot.taxonomies.map(({ taxonomy_id: taxonomyId }) =>
    createInstance(
      user,
      models.ServiceTaxonomy.create.bind(models.ServiceTaxonomy),
      {
        service_id: restoredService.id,
        taxonomy_id: taxonomyId,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.languages.map(({ language_id: languageId }) =>
    createInstance(
      user,
      models.ServiceLanguages.create.bind(models.ServiceLanguages),
      {
        service_id: restoredService.id,
        language_id: languageId,
      },
      { transaction },
    )));

  await createInstance(
    user,
    models.DocumentsInfo.create.bind(models.DocumentsInfo),
    {
      service_id: restoredService.id,
      ...(serviceSnapshot.documentsInfo || {}),
    },
    { transaction },
  );

  await Promise.all(serviceSnapshot.requiredDocuments.map(requiredDocument =>
    createInstance(
      user,
      models.RequiredDocument.create.bind(models.RequiredDocument),
      {
        service_id: restoredService.id,
        document: requiredDocument.document,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.eligibilities.map(eligibility =>
    createInstance(
      user,
      models.Eligibility.create.bind(models.Eligibility),
      {
        service_id: restoredService.id,
        parameter_id: eligibility.parameter_id,
        description: eligibility.description,
        eligible_values: eligibility.eligible_values,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.taxonomySpecificAttributes.map(attribute =>
    createInstance(
      user,
      models.ServiceTaxonomySpecificAttribute.create
        .bind(models.ServiceTaxonomySpecificAttribute),
      {
        service_id: restoredService.id,
        attribute_id: attribute.attribute_id,
        values: attribute.values,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.regularSchedules.map(schedule =>
    createInstance(
      user,
      models.RegularSchedule.create.bind(models.RegularSchedule),
      {
        service_id: restoredService.id,
        weekday: schedule.weekday,
        opens_at: schedule.opens_at,
        closes_at: schedule.closes_at,
        location_id: schedule.location_id,
        service_at_location_id: schedule.atLocation ? restoredLink.id : null,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.holidaySchedules.map(schedule =>
    createInstance(
      user,
      models.HolidaySchedule.create.bind(models.HolidaySchedule),
      {
        service_id: restoredService.id,
        closed: schedule.closed,
        opens_at: schedule.opens_at,
        closes_at: schedule.closes_at,
        start_date: schedule.start_date,
        end_date: schedule.end_date,
        weekday: schedule.weekday,
        occasion: schedule.occasion,
        freq: schedule.freq,
        interval: schedule.interval,
        byday: schedule.byday,
        bymonthday: schedule.bymonthday,
        bymonth: schedule.bymonth,
        valid_from: schedule.valid_from,
        valid_to: schedule.valid_to,
        description: schedule.description,
        exdates: schedule.exdates,
        location_id: schedule.location_id,
        service_at_location_id: schedule.atLocation ? restoredLink.id : null,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.phones.map(phone =>
    createInstance(
      user,
      models.Phone.create.bind(models.Phone),
      {
        service_id: restoredService.id,
        number: phone.number,
        extension: phone.extension,
        type: phone.type,
        language: phone.language,
        description: phone.description,
        location_id: phone.location_id,
        service_at_location_id: phone.atLocation ? restoredLink.id : null,
      },
      { transaction },
    )));

  await Promise.all((serviceSnapshot.paymentsAccepted || []).map(({ payment }) =>
    createInstance(
      user,
      models.PaymentAccepted.create.bind(models.PaymentAccepted),
      { service_id: restoredService.id, payment },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.eventRelatedInfos.map(info =>
    createInstance(
      user,
      models.EventRelatedInfo.create.bind(models.EventRelatedInfo),
      {
        service_id: restoredService.id,
        event: info.event,
        information: info.information,
        location_id: info.location_id,
      },
      { transaction },
    )));

  await Promise.all(serviceSnapshot.serviceAreas.map(area =>
    createInstance(
      user,
      models.ServiceArea.create.bind(models.ServiceArea),
      {
        service_id: restoredService.id,
        postal_codes: area.postal_codes,
        description: area.description,
      },
      { transaction },
    )));

  const reattach = async (model, ids = []) => {
    if (!ids.length) return;
    const rows = await model.findAll({ where: { id: ids }, transaction });
    await Promise.all(rows.map(row => updateInstance(
      user,
      row,
      { service_at_location_id: restoredLink.id },
      { transaction },
    )));
  };
  const linked = serviceSnapshot.serviceAtLocation || {};
  await Promise.all([
    reattach(models.Phone, linked.phoneIds),
    reattach(models.RegularSchedule, linked.regularScheduleIds),
    reattach(models.HolidaySchedule, linked.holidayScheduleIds),
    reattach(models.Comment, linked.commentIds),
  ]);
};

export const scheduleLocationDeletion = (locationId, note, user) =>
  sequelize.transaction(async (transaction) => {
    const location = await getLocationForDeletion(locationId, transaction);
    if (!location) {
      throw new NotFoundError('Location not found');
    }

    const existingSchedule = await getScheduleWithLocation(locationId, transaction);
    if (existingSchedule) {
      throw new ValidationError('Location is already scheduled for deletion');
    }

    assertServicesAreExclusiveToLocation(location);

    const deletedServiceCount = location.Services.length;
    const wasHiddenFromSearch = Boolean(location.hidden_from_search);
    const serviceSnapshots = await Promise.all(location.Services
      .map(service => createServiceSnapshot(service, location.id, transaction)));

    await Promise.all(location.Services.map(service =>
      deleteService(service.id, user, { transaction })));

    await updateInstance(
      user,
      location,
      { hidden_from_search: true },
      {
        fields: ['hidden_from_search'],
        transaction,
      },
    );

    await createInstance(
      user,
      models.LocationDeletionSchedule.create.bind(models.LocationDeletionSchedule),
      {
        location_id: location.id,
        note,
        requested_by: user,
        scheduled_for_permanent_deletion_at: addOneMonth(new Date()),
        deleted_service_count: deletedServiceCount,
        service_snapshots: serviceSnapshots,
        was_hidden_from_search: wasHiddenFromSearch,
      },
      { transaction },
    );

    return getScheduleWithLocation(locationId, transaction);
  });

export const listScheduledLocationDeletions = (organizationIds = null) =>
  models.LocationDeletionSchedule.findAll({
    include: [{
      model: models.Location.unscoped(),
      required: true,
      ...(organizationIds ? { where: { organization_id: { [Op.in]: organizationIds } } } : {}),
      include: [models.Organization],
    }],
    order: [['scheduled_for_permanent_deletion_at', 'ASC']],
  });

// Run from the scheduled Lambda invocation. Lock each schedule so a concurrent restore or
// second invocation cannot delete a location after its schedule has been cancelled.
export const processDueLocationDeletions = async (now = new Date()) => {
  const dueSchedules = await models.LocationDeletionSchedule.findAll({
    attributes: ['id'],
    where: { scheduled_for_permanent_deletion_at: { [Op.lte]: now } },
    order: [['scheduled_for_permanent_deletion_at', 'ASC']],
    limit: 25,
  });

  let deletedCount = 0;
  const failures = [];
  for (const { id } of dueSchedules) {
    try {
      const deleted = await sequelize.transaction(async (transaction) => {
        const schedule = await models.LocationDeletionSchedule.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!schedule || schedule.scheduled_for_permanent_deletion_at > now) return false;

        const location = await models.Location.unscoped().findByPk(schedule.location_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!location) {
          await schedule.destroy({ transaction });
          return false;
        }

        await destroyInstance('scheduled-location-deletion', location, { transaction });
        return true;
      });
      if (deleted) deletedCount += 1;
    } catch (err) {
      failures.push({ id, error: err });
      // eslint-disable-next-line no-console
      console.error(`Failed to process location deletion schedule ${id}`, err);
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} location deletion schedule(s) failed to process`);
  }
  return deletedCount;
};

export const restoreLocationDeletion = (locationId, user) =>
  sequelize.transaction(async (transaction) => {
    const lockedSchedule = await models.LocationDeletionSchedule.findOne({
      where: { location_id: locationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedSchedule) {
      throw new NotFoundError('Location is not scheduled for deletion');
    }
    const schedule = await getScheduleWithLocation(locationId, transaction);

    await Promise.all((schedule.service_snapshots || []).map(serviceSnapshot =>
      restoreServiceSnapshot(schedule.Location, serviceSnapshot, user, transaction)));

    await updateInstance(
      user,
      schedule.Location,
      { hidden_from_search: schedule.was_hidden_from_search },
      {
        fields: ['hidden_from_search'],
        transaction,
      },
    );

    await destroyInstance(user, schedule, { transaction });
  });

export default {
  scheduleLocationDeletion,
  listScheduledLocationDeletions,
  restoreLocationDeletion,
  processDueLocationDeletions,
  serializeLocationDeletionSchedule,
};
