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

const getLocationForDeletion = (locationId, transaction) => models.Location.findByPk(locationId, {
  include: [
    models.Organization,
    {
      model: models.Service,
      include: snapshotServiceIncludes,
    },
  ],
  transaction,
});

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

const createServiceSnapshot = (service, locationId) => {
  const plainService = service.get({ plain: true });
  const locationLink =
    plainService.Locations.find(serviceLocation => serviceLocation.id === locationId);

  return {
    service: {
      name: plainService.name,
      description: plainService.description,
      url: plainService.url,
      email: plainService.email,
      interpretation_services: plainService.interpretation_services,
      fees: plainService.fees,
      additional_info: plainService.additional_info,
    },
    serviceAtLocation: locationLink && locationLink.ServiceAtLocation
      ? {
        description: locationLink.ServiceAtLocation.description,
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
    })),
    holidaySchedules: plainService.HolidaySchedules.map(schedule => ({
      closed: schedule.closed,
      opens_at: schedule.opens_at,
      closes_at: schedule.closes_at,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      weekday: schedule.weekday,
      occasion: schedule.occasion,
    })),
    phones: plainService.Phones.map(phone => ({
      number: phone.number,
      extension: phone.extension,
      type: phone.type,
      language: phone.language,
      description: phone.description,
    })),
    eventRelatedInfos: plainService.EventRelatedInfos.map(info => ({
      event: info.event,
      information: info.information,
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

  await createInstance(
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
      },
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
    const serviceSnapshots = location.Services
      .map(service => createServiceSnapshot(service, location.id));

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

export const listScheduledLocationDeletions = () => models.LocationDeletionSchedule.findAll({
  include: [{
    model: models.Location,
    include: [models.Organization],
  }],
  order: [['scheduled_for_permanent_deletion_at', 'ASC']],
});

export const restoreLocationDeletion = (locationId, user) =>
  sequelize.transaction(async (transaction) => {
    const schedule = await getScheduleWithLocation(locationId, transaction);
    if (!schedule) {
      throw new NotFoundError('Location is not scheduled for deletion');
    }

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
  serializeLocationDeletionSchedule,
};
