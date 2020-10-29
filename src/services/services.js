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

const serviceTaxonomySpecificAttributeNames = [
  'hasHivNutrition',
  'tgncClothing',
  'clothingOccasion',
  'wearerAge',
];

const updateHours = async (service, hours, { t, user, metadata }) => {
  await models.RegularSchedule.destroy({ where: { service_id: service.id }, transaction: t });

  const modelCreateFunction = models.RegularSchedule.create.bind(models.RegularSchedule);
  await Promise.all(hours.map(hoursPart => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    weekday: getDayOfWeekInteger(hoursPart.weekday),
    opens_at: hoursPart.opensAt,
    closes_at: hoursPart.closesAt,
  }, { transaction: t, metadata })));
};

const updateIrregularHours = async (service, hours, { t, user, metadata }) => {
  const relevantOccasions = [...new Set(hours.map(({ occasion }) => occasion))];
  await models.HolidaySchedule.destroy({
    where: {
      service_id: service.id,
      occasion: { [sequelize.Op.in]: relevantOccasions },
    },
    transaction: t,
  });

  const modelCreateFunction = models.HolidaySchedule.create.bind(models.HolidaySchedule);
  await Promise.all(hours.map(hoursPart => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    opens_at: hoursPart.opensAt,
    closes_at: hoursPart.closesAt,
    closed: hoursPart.closed || false,
    start_date: hoursPart.startDate,
    end_date: hoursPart.endDate,
    occasion: hoursPart.occasion,
    weekday: hoursPart.weekday != null ? getDayOfWeekInteger(hoursPart.weekday) : undefined,
  }, { transaction: t, metadata })));
};

// TODO: This is far less efficient than "service.setLanguages(languageIds, { transaction: t })".
// Need to track metadata without having to explicitly insert (/delete) every instance.
const updateLanguages = async (service, languageIds, { t, user, metadata }) => {
  await models.ServiceLanguages.destroy({ where: { service_id: service.id }, transaction: t });

  const modelCreateFunction = models.ServiceLanguages.create.bind(models.ServiceLanguages);
  await Promise.all(languageIds.map(languageId => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    language_id: languageId,
  }, { transaction: t, metadata })));
};

const updateServiceAreas = async (service, area, { t, user, metadata }) => {
  const { postal_codes: postalCodes } = area;

  await models.ServiceArea.destroy({ where: { service_id: service.id }, transaction: t });

  await createInstance(user, models.ServiceArea.create.bind(models.ServiceArea), {
    service_id: service.id,
    postal_codes: postalCodes,
  }, { transaction: t, metadata });
};

const updateEligibilityParam = async (
  service, paramName, { eligible_values: eligibleValues, description }, { t, user, metadata },
) => {
  const eligibilityParam = await models.EligibilityParameter.find({
    where: { name: paramName },
  });

  const eligibilityParamValue = await models.Eligibility.find({
    where: {
      service_id: service.id,
      parameter_id: eligibilityParam.id,
    },
  });

  if (eligibilityParamValue) {
    await updateInstance(
      user,
      eligibilityParamValue,
      {
        eligible_values: eligibleValues,
        description,
      },
    );
  } else {
    await createInstance(
      user,
      models
        .Eligibility
        .create
        .bind(models.Eligibility),
      {
        service_id: service.id,
        parameter_id: eligibilityParam.id,
        eligible_values: eligibleValues,
        description,
      },
      { transaction: t },
    );
  }
};

const updateServiceTaxonomySpecificAttributes = async (
  service, attributeName, value, { t, user, metadata },
) => {
  const specificAttribute = await models.TaxonomySpecificAttribute.find({
    where: { name: attributeName },
  });

  const specificAttributeValue = await models.ServiceTaxonomySpecificAttribute.find({
    where: {
      service_id: service.id,
      attribute_id: specificAttribute.id,
    },
  });

  if (specificAttributeValue) {
    await updateInstance(
      user,
      specificAttributeValue,
      {
        values: value,
      },
      { transaction: t },
    );
  } else {
    await createInstance(
      user,
      models
        .ServiceTaxonomySpecificAttribute
        .create
        .bind(models.ServiceTaxonomySpecificAttribute),
      {
        service_id: service.id,
        attribute_id: specificAttribute.id,
        values: value,
      },
      { transaction: t },
    );
  }
};

const updateDocuments = async (service, documents, { t, user, metadata }) => {
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
      }, { transaction: t, metadata })));
  }

  const documentsInfoUpdates = {};
  if (recertificationTime != null) {
    documentsInfoUpdates.recertification_time = recertificationTime;
  }
  if (gracePeriod != null) { documentsInfoUpdates.grace_period = gracePeriod; }
  if (additionalInfo != null) { documentsInfoUpdates.additional_info = additionalInfo; }

  await updateInstance(
    user,
    service.DocumentsInfo,
    documentsInfoUpdates,
    { transaction: t, metadata },
  );
};

const updateEventRelatedInfo = async (service, eventRelatedInfo, { t, user, metadata }) => {
  await models.EventRelatedInfo.destroy({
    where: {
      service_id: service.id,
      event: eventRelatedInfo.event,
    },
    transaction: t,
  });

  if (eventRelatedInfo.information) {
    const modelCreateFunction = models.EventRelatedInfo.create.bind(models.EventRelatedInfo);
    await createInstance(user, modelCreateFunction, {
      service_id: service.id,
      event: eventRelatedInfo.event,
      information: eventRelatedInfo.information,
    }, { transaction: t, metadata });
  }
};

export const updateService = (
  service,
  update,
  user,
  metadata,
) => sequelize.transaction(async (t) => {
  const {
    taxonomy,
    hours,
    irregularHours,
    languageIds,
    documents,
    additionalInfo,
    eventRelatedInfo,
    agesServed,
    whoDoesItServe,
    area,
    ...otherUpdateProps
  } = update;
  const updatePromises = [];

  if (taxonomy) {
    updatePromises.push(service.setTaxonomies([taxonomy], { transaction: t }));
  }

  if (hours) {
    updatePromises.push(updateHours(service, hours, { t, user, metadata }));
  }

  if (irregularHours) {
    updatePromises.push(updateIrregularHours(service, irregularHours, { t, user, metadata }));
  }

  if (eventRelatedInfo) {
    updatePromises.push(updateEventRelatedInfo(service, eventRelatedInfo, { t, user, metadata }));
  }

  if (languageIds) {
    updatePromises.push(updateLanguages(service, languageIds, { t, user, metadata }));
  }

  if (documents) {
    updatePromises.push(updateDocuments(service, documents, { t, user, metadata }));
  }

  if (area) {
    updatePromises.push(updateServiceAreas(service, area, { t, user, metadata }));
  }

  serviceTaxonomySpecificAttributeNames.forEach((attr) => {
    if (attr in otherUpdateProps) {
      updatePromises.push(updateServiceTaxonomySpecificAttributes(
        service,
        attr,
        otherUpdateProps[attr],
        { t, user, metadata },
      ));
    }
  });

  Object.keys(eligibilityParams).forEach((attr) => {
    if (attr in otherUpdateProps) {
      updatePromises.push(updateEligibilityParam(
        service,
        attr,
        otherUpdateProps[attr],
        { t, user, metadata },
      ));
    }
  });

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
    { fields: editableFields, transaction: t, metadata },
  ));

  await Promise.all(updatePromises);
});

export const createService = async (
  location,
  serviceData,
  user,
  metadata,
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
  }, { transaction: t, metadata });

  await createInstance(user, models.ServiceTaxonomy.create.bind(models.ServiceTaxonomy), {
    service_id: createdService.id,
    taxonomy_id: taxonomy.id,
  }, { transaction: t, metadata });

  await createInstance(
    user,
    models.DocumentsInfo.create.bind(models.DocumentsInfo),
    { service_id: createdService.id },
    { transaction: t, metadata },
  );

  return createdService;
});

export default {
  updateService,
  createService,
};
