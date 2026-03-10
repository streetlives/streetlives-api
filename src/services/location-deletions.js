import models from '../models';
import { createInstance, destroyInstance, updateInstance } from './data-changes';
import { deleteService } from './services';
import { NotFoundError, ValidationError } from '../utils/errors';

const { sequelize } = models;
const SHARED_SERVICE_DELETION_ERROR =
  'Cannot schedule deletion for a location with services shared across multiple locations';

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
      include: [{
        model: models.Location,
        attributes: ['id'],
      }],
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
