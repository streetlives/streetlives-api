import { getDayOfWeekInteger } from '../utils/times';
import models from '../models';
import { updateInstance, createInstance } from './data-changes';
import { NotFoundError } from '../utils/errors';

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

export const updateService = (service, update, user) => sequelize.transaction(async (t) => {
  const updatePromises = [];

  const { taxonomyId, hours, ...otherUpdateProps } = update;
  if (taxonomyId) {
    const taxonomy = await models.Taxonomy.findById(taxonomyId);
    if (!taxonomy) {
      throw new NotFoundError('Taxonomy not found');
    }

    updatePromises.push(service.setTaxonomies([taxonomy], { transaction: t }));
  }

  if (hours) {
    updatePromises.push(updateHours(service, hours, t));
  }

  const editableFields = ['name', 'description', 'url'];
  updatePromises.push(updateInstance(
    user,
    service,
    otherUpdateProps,
    { fields: editableFields, transaction: t },
  ));

  await Promise.all(updatePromises);
});

export const createService = async (
  location,
  taxonomy,
  serviceData,
  user,
) => sequelize.transaction(async (t) => {
  const { name, description, url } = serviceData;

  const modelCreateFunction = location.createService.bind(location);
  const createdService = await createInstance(user, modelCreateFunction, {
    name,
    description,
    url,
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
