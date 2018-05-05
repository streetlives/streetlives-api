import { getDayOfWeekInteger } from '../utils/times';
import models from '../models';
import { updateInstance, createInstance } from './data-changes';

const { sequelize } = models;

const updateHours = async (service, hours, t) => {
  await models.RegularSchedule.destroy({ where: { service_id: service.id }, transaction: t });

  await Promise.all(hours.map(hoursPart => models.RegularSchedule.create({
    service_id: service.id,
    weekday: getDayOfWeekInteger(hoursPart.weekday),
    opens_at: hoursPart.opensAt,
    closes_at: hoursPart.closesAt,
  }, { transaction: t })));
};

const updateLanguages = (service, languageIds, t) =>
  service.setLanguages(languageIds, { transaction: t });

export const updateService = (service, update, user) => sequelize.transaction(async (t) => {
  const {
    taxonomy,
    hours,
    languageIds,
    additionalInfo,
    ...otherUpdateProps
  } = update;
  const updatePromises = [];

  if (taxonomy) {
    updatePromises.push(service.setTaxonomies([taxonomy], { transaction: t }));
  }

  if (hours) {
    updatePromises.push(updateHours(service, hours, t));
  }

  if (languageIds) {
    updatePromises.push(updateLanguages(service, languageIds, t));
  }

  const editableFields = ['name', 'description', 'url', 'additional_info'];
  updatePromises.push(updateInstance(
    user,
    service,
    { ...otherUpdateProps, additional_info: additionalInfo },
    { fields: editableFields, transaction: t },
  ));

  await Promise.all(updatePromises);
});

export const createService = async (
  location,
  serviceData,
  user,
) => sequelize.transaction(async (t) => {
  const {
    name,
    description,
    url,
    additionalInfo,
    taxonomy,
  } = serviceData;

  const modelCreateFunction = location.createService.bind(location);
  const createdService = await createInstance(user, modelCreateFunction, {
    name,
    description,
    url,
    additional_info: additionalInfo,
    organization_id: location.organization_id,
  }, { transaction: t });

  await createInstance(user, models.ServiceTaxonomy.create.bind(models.ServiceTaxonomy), {
    service_id: createdService.id,
    taxonomy_id: taxonomy.id,
  }, { transaction: t });

  return createdService;
});

export default {
  updateService,
  createService,
};
