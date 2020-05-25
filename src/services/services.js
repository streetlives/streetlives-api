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

const updateIrregularHours = async (service, hours, t, user) => {
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

const updateServiceAreas = async (user, service, area, t) => {
  if (area != null) {
    const { postal_codes: postalCodes, description } = area;

    await models.ServiceArea.destroy({ where: { service_id: service.id }, transaction: t });

    createInstance(user, models.ServiceArea.create.bind(models.ServiceArea), {
      service_id: service.id,
      postal_codes: postalCodes,
      description,
    }, { transaction: t });
  }
};

const updateMembership = async (
  user, service, { eligible_values: eligibleValues, description }, t,
) => {
  const eligibilityParam = await models.EligibilityParameter.find({
    where: { name: eligibilityParams.membership },
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

const updateServiceTaxonomySpecificAttributes = async (user, service, attributeName, value, t) => {
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

const updateEventRelatedInfo = async (service, eventRelatedInfo, t, user) => {
  await models.EventRelatedInfo.destroy({
    where: {
      service_id: service.id,
      event: eventRelatedInfo.event,
    },
    transaction: t,
  });

  const modelCreateFunction = models.EventRelatedInfo.create.bind(models.EventRelatedInfo);
  await createInstance(user, modelCreateFunction, {
    service_id: service.id,
    event: eventRelatedInfo.event,
    information: eventRelatedInfo.information,
  }, { transaction: t });
};

export const updateService = (service, update, user) => sequelize.transaction(async (t) => {
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
    membership,
    ...otherUpdateProps
  } = update;
  const updatePromises = [];

  if (taxonomy) {
    updatePromises.push(service.setTaxonomies([taxonomy], { transaction: t }));
  }

  if (hours) {
    updatePromises.push(updateHours(service, hours, t, user));
  }

  if (irregularHours) {
    updatePromises.push(updateIrregularHours(service, irregularHours, t, user));
  }

  if (eventRelatedInfo) {
    updatePromises.push(updateEventRelatedInfo(service, eventRelatedInfo, t, user));
  }

  if (languageIds) {
    updatePromises.push(updateLanguages(service, languageIds, t, user));
  }

  if (documents) {
    updatePromises.push(updateDocuments(user, service, documents, t));
  }

  if (area) {
    updatePromises.push(updateServiceAreas(user, service, area, t));
  }

  serviceTaxonomySpecificAttributeNames.forEach((attr) => {
    if (attr in otherUpdateProps) {
      updatePromises.push(updateServiceTaxonomySpecificAttributes(
        user,
        service,
        attr,
        otherUpdateProps[attr],
        t,
      ));
    }
  });

  if (membership) {
    updatePromises.push(updateMembership(
      user,
      service,
      membership,
      t,
    ));
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
