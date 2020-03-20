import { getDayOfWeekInteger } from '../utils/times';
import models from '../models';
import { updateInstance, createInstance } from './data-changes';

const { sequelize } = models;

export const documentTypes = {
  referralLetter: 'referral letter',
  photoId: 'photo ID',
};

export const eligibilityParams = {
  membership: 'membership',
  gender: 'gender',
};

const updateHours = async (service, hours, t, user) => {
  await models.RegularSchedule.destroy({ where: { service_id: service.id }, transaction: t });

  const modelCreateFunction = models.RegularSchedule.create.bind(models.RegularSchedule);
  await Promise.all(hours.map(hoursPart => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    weekday: getDayOfWeekInteger(hoursPart.weekday),
    opens_at: hoursPart.opensAt,
    closes_at: hoursPart.closesAt,
  }, { transaction: t })));
};

// TODO: This is far less efficient than "service.setLanguages(languageIds, { transaction: t })".
// Need to track metadata without having to explicitly insert (/delete) every instance.
const updateLanguages = async (service, languageIds, t, user) => {
  await models.ServiceLanguages.destroy({ where: { service_id: service.id }, transaction: t });

  const modelCreateFunction = models.ServiceLanguages.create.bind(models.ServiceLanguages);
  await Promise.all(languageIds.map(languageId => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    language_id: languageId,
  }, { transaction: t })));
};

const updateDocuments = async (user, service, documents, t) => {
  const {
    proofs,
    recertificationTime,
    gracePeriod,
    additionalInfo,
  } = documents;

  if (proofs != null) {
    await models.RequiredDocument.destroy({ where: { service_id: service.id }, transaction: t });
    await Promise.all(proofs.map(proof =>
      createInstance(user, models.RequiredDocument.create.bind(models.RequiredDocument), {
        service_id: service.id,
        document: proof,
      }, { transaction: t })));
  }

  const documentsInfoUpdates = {};
  if (recertificationTime != null) {
    documentsInfoUpdates.recertification_time = recertificationTime;
  }
  if (gracePeriod != null) { documentsInfoUpdates.grace_period = gracePeriod; }
  if (additionalInfo != null) { documentsInfoUpdates.additional_info = additionalInfo; }

  await updateInstance(user, service.DocumentsInfo, documentsInfoUpdates, { transaction: t });
};

export const updateService = (service, update, user) => sequelize.transaction(async (t) => {
  const {
    taxonomy,
    hours,
    languageIds,
    documents,
    additionalInfo,
    agesServed,
    whoDoesItServe,
    ...otherUpdateProps
  } = update;
  const updatePromises = [];

  if (taxonomy) {
    updatePromises.push(service.setTaxonomies([taxonomy], { transaction: t }));
  }

  if (hours) {
    updatePromises.push(updateHours(service, hours, t, user));
  }

  if (languageIds) {
    updatePromises.push(updateLanguages(service, languageIds, t, user));
  }

  if (documents) {
    updatePromises.push(updateDocuments(user, service, documents, t));
  }

  const editableFields = [
    'name',
    'description',
    'url',
    'additional_info',
    'ages_served',
    'who_does_it_serve',
  ];
  updatePromises.push(updateInstance(
    user,
    service,
    {
      ...otherUpdateProps,
      additional_info: additionalInfo,
      ages_served: agesServed,
      who_does_it_serve: whoDoesItServe,
    },
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

  await createInstance(
    user,
    models.DocumentsInfo.create.bind(models.DocumentsInfo),
    { service_id: createdService.id },
    { transaction: t },
  );

  return createdService;
});

export default {
  updateService,
  createService,
};
