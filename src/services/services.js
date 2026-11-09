import { Op } from 'sequelize';

import { getDayOfWeekInteger } from '../utils/times';
import models from '../models';
import {
  updateInstance,
  createInstance,
  destroyInstance,
  destroyAllInstances,
} from './data-changes';

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

// Removes a service's rows of `model` matching `where`, recording each delete against the service.
const destroyServiceRows = (model, where, { t, user, metadata }) =>
  destroyAllInstances(user, model, where, { transaction: t, metadata, linkField: 'service_id' });

const updateHours = async (service, hours, { t, user, metadata }) => {
  await destroyServiceRows(
    models.RegularSchedule,
    { service_id: service.id },
    { t, user, metadata },
  );

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
  const occasions = relevantOccasions.filter(occasion => occasion != null);

  const whereClause = { service_id: service.id };
  if (hours.length) {
    // Rows sent without an occasion (HSDS rows dated with validFrom) replace the stored rows
    // that have none; `IN (NULL)` would match nothing and leave them behind.
    whereClause.occasion = occasions.length < relevantOccasions.length
      ? { [Op.or]: [{ [Op.in]: occasions }, { [Op.is]: null }] }
      : { [Op.in]: occasions };
  }

  await destroyServiceRows(models.HolidaySchedule, whereClause, { t, user, metadata });

  if (hours.length === 0) return;

  const modelCreateFunction = models.HolidaySchedule.create.bind(models.HolidaySchedule);
  await Promise.all(hours.map(hoursPart => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    opens_at: hoursPart.opensAt,
    closes_at: hoursPart.closesAt,
    closed: hoursPart.closed || false,
    // start_date/end_date are kept in sync with the HSDS valid_from/valid_to until they're dropped.
    start_date: hoursPart.validFrom || hoursPart.startDate,
    end_date: hoursPart.validTo || hoursPart.endDate,
    valid_from: hoursPart.validFrom || hoursPart.startDate,
    valid_to: hoursPart.validTo || hoursPart.endDate,
    occasion: hoursPart.occasion,
    weekday: hoursPart.weekday != null ? getDayOfWeekInteger(hoursPart.weekday) : undefined,
    freq: hoursPart.freq,
    interval: hoursPart.interval,
    byday: hoursPart.byday,
    bymonthday: hoursPart.bymonthday,
    bymonth: hoursPart.bymonth,
    description: hoursPart.description,
    exdates: hoursPart.exdates && hoursPart.exdates.length ? hoursPart.exdates : null,
  }, { transaction: t, metadata })));
};

// TODO: This is far less efficient than "service.setLanguages(languageIds, { transaction: t })".
// Need to track metadata without having to explicitly insert (/delete) every instance.
const updateLanguages = async (service, languageIds, { t, user, metadata }) => {
  await destroyServiceRows(
    models.ServiceLanguages,
    { service_id: service.id },
    { t, user, metadata },
  );

  const modelCreateFunction = models.ServiceLanguages.create.bind(models.ServiceLanguages);
  await Promise.all(languageIds.map(languageId => createInstance(user, modelCreateFunction, {
    service_id: service.id,
    language_id: languageId,
  }, { transaction: t, metadata })));
};

const updateServiceAreas = async (service, area, { t, user, metadata }) => {
  const { postal_codes: postalCodes } = area;

  await destroyServiceRows(models.ServiceArea, { service_id: service.id }, { t, user, metadata });

  await createInstance(user, models.ServiceArea.create.bind(models.ServiceArea), {
    service_id: service.id,
    postal_codes: postalCodes,
  }, { transaction: t, metadata });
};

const updateEligibilityParam = async (
  service, paramName, { eligible_values: eligibleValues, description }, { t, user, metadata },
) => {
  const eligibilityParam = await models.EligibilityParameter.findOne({
    where: { name: paramName },
  });

  const eligibilityParamValue = await models.Eligibility.findOne({
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
  const specificAttribute = await models.TaxonomySpecificAttribute.findOne({
    where: { name: attributeName },
    transaction: t,
  });

  const specificAttributeValue = await models.ServiceTaxonomySpecificAttribute.findOne({
    where: {
      service_id: service.id,
      attribute_id: specificAttribute.id,
    },
    transaction: t,
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
    await destroyServiceRows(
      models.RequiredDocument,
      { service_id: service.id },
      { t, user, metadata },
    );
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

// What service.setTaxonomies([taxonomy]) did, but through the audited helpers.
const updateTaxonomy = async (service, taxonomy, { t, user, metadata }) => {
  await destroyServiceRows(models.ServiceTaxonomy, {
    service_id: service.id,
    taxonomy_id: { [Op.ne]: taxonomy.id },
  }, { t, user, metadata });

  const existing = await models.ServiceTaxonomy.findOne({
    where: { service_id: service.id, taxonomy_id: taxonomy.id },
    transaction: t,
  });
  if (existing) return;

  await createInstance(user, models.ServiceTaxonomy.create.bind(models.ServiceTaxonomy), {
    service_id: service.id,
    taxonomy_id: taxonomy.id,
  }, { transaction: t, metadata });
};

const updateEventRelatedInfo = async (service, eventRelatedInfo, { t, user, metadata }) => {
  await destroyServiceRows(models.EventRelatedInfo, {
    service_id: service.id,
    event: eventRelatedInfo.event,
  }, { t, user, metadata });

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
    updatePromises.push(updateTaxonomy(service, taxonomy, { t, user, metadata }));
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
 
  if(whoDoesItServe) {

    updatePromises.push(updateEligibilityParam(
      service,
      'age',
      {
        eligible_values: whoDoesItServe,
        description: ''
      },
      { t, user, metadata },
    ));
  }

  serviceTaxonomySpecificAttributeNames.forEach((attr) => {
    if (attr in otherUpdateProps) {
      updatePromises.push(updateServiceTaxonomySpecificAttributes(
        service,
        attr,
        otherUpdateProps[attr],
        { t, user, metadata },
      ));
      delete otherUpdateProps[attr];
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
      delete otherUpdateProps[attr];
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
  const serviceFieldUpdates = { ...otherUpdateProps };
  if (additionalInfo !== undefined) serviceFieldUpdates.additional_info = additionalInfo;
  if (agesServed !== undefined) serviceFieldUpdates.ages_served = agesServed;
  if (whoDoesItServe !== undefined) serviceFieldUpdates.who_does_it_serve = whoDoesItServe;
  if (Object.keys(serviceFieldUpdates).length) {
    updatePromises.push(updateInstance(
      user,
      service,
      serviceFieldUpdates,
      { fields: editableFields, transaction: t, metadata },
    ));
  }

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

export const deleteService = (serviceId, user) => sequelize.transaction(async (t) => {
  const service = await models.Service.findByPk(serviceId, { include: [models.Location] });
  if (!service) return;

  const destroyAssociation = model =>
    destroyServiceRows(model, { service_id: serviceId }, { t, user });
  await Promise.all([
    destroyAssociation(models.DocumentsInfo),
    destroyAssociation(models.Eligibility),
    destroyAssociation(models.HolidaySchedule),
    destroyAssociation(models.RegularSchedule),
    destroyAssociation(models.RequiredDocument),
    destroyAssociation(models.ServiceArea),
    destroyAssociation(models.Phone),
    destroyAssociation(models.ServiceTaxonomySpecificAttribute),
    // These would otherwise go by cascade (languages, taxonomy) or be orphaned by SET NULL
    // (event info, payments), either way without a metadata row.
    destroyAssociation(models.ServiceLanguages),
    destroyAssociation(models.ServiceTaxonomy),
    destroyAssociation(models.EventRelatedInfo),
    destroyAssociation(models.PaymentAccepted),
  ]);

  // The service_at_locations rows go with the service by cascade, so record both ends of each
  // link: that is what ties the deleted service to its locations in the change feed.
  const recordLocationsOfDeletedService = () => Promise.all(service.Locations
    .flatMap(location => [['location_id', location.id], ['service_id', service.id]]
      .map(([fieldName, value]) => models.Metadata.create({
        resource_table: models.ServiceAtLocation.tableName,
        resource_id: location.ServiceAtLocation.id,
        last_action_date: new Date(),
        last_action_type: models.Metadata.actionTypes.delete,
        field_name: fieldName,
        previous_value: value,
        updated_by: user,
        source: `${service.id} service deletion`,
      }, { transaction: t }))));

  await Promise.all([
    destroyInstance(user, service, { transaction: t }),
    recordLocationsOfDeletedService(),
  ]);
});

export default {
  updateService,
  createService,
  deleteService,
};
