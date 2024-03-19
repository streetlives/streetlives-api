import models from '../models';

export const getMetadataForLocation = async (location, address) => {
  const phoneIds = location.Phones.map(({ id }) => id);
  const eventRelatedInfoIds = location.EventRelatedInfos.map(({ id }) => id);
  const [
    locationMetadata,
    organizationMetadata,
    addressMetadata,
    phonesLatestUpdate,
    eventInfoLatestUpdate,
  ] = await Promise.all([
    models.Metadata.getLastUpdateDatesForResourceFields(location.id),
    models.Metadata.getLastUpdateDatesForResourceFields(location.OrganizationId),
    models.Metadata.getLastUpdateDatesForResourceFields(address.id),
    models.Metadata.getLatestUpdateDateForResources(phoneIds),
    models.Metadata.getLatestUpdateDateForResources(eventRelatedInfoIds),
  ]);

  const sources = [...new Set(await models.Metadata.getSourcesForResources([
    location.id,
    location.OrganizationId,
    address.id,
    ...phoneIds,
    ...eventRelatedInfoIds,
  ]))];

  return {
    location: [
      ...locationMetadata,
      ...(phonesLatestUpdate ?
        [{ field_name: 'phones', last_action_date: phonesLatestUpdate }] :
        []),
      ...(eventInfoLatestUpdate ?
        [{ field_name: 'eventRelatedInfo', last_action_date: eventInfoLatestUpdate }] :
        []),
    ],
    organization: organizationMetadata,
    address: addressMetadata,
    sources,
  };
};

const getMetadataForServiceDocuments = async (service) => {
  if (!service.DocumentsInfo) {
    return null;
  }

  const [
    proofsLatestUpdate,
    documentsInfoMetadata,
  ] = await Promise.all([
    models.Metadata.getLatestUpdateDateForResources(service.RequiredDocuments.map(doc => doc.id)),
    models.Metadata.getLastUpdateDatesForResourceFields(service.DocumentsInfo.id),
  ]);

  const documentsMetadata = [...documentsInfoMetadata];
  if (proofsLatestUpdate) {
    documentsMetadata.push({
      field_name: 'proofs',
      last_action_date: proofsLatestUpdate,
    });
  }

  return documentsMetadata;
};

export const getMetadataForService = async (service) => {
  const [
    serviceMetadata,
    hoursLatestUpdate,
    irregularHoursLatestUpdate,
    languagesLatestUpdate,
    eventRelatedInfoLatestUpdate,
    taxonomySpecificAttributesUpdates,
  ] = await Promise.all([
    models.Metadata.getLastUpdateDatesForResourceFields(service.id),
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'regular_schedules',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'holiday_schedules',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'service_languages',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
    models.Metadata.getLatestUpdateDateForResources(service.EventRelatedInfos.map(info => info.id)),
    models.Metadata
      .getLastUpdateDatesForResourceFields(service
        .ServiceTaxonomySpecificAttributes.map(a => a.id)),
  ]);

  const serviceWithAdditionalMetadata = [...serviceMetadata];
  if (hoursLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'hours',
      last_action_date: hoursLatestUpdate,
    });
  }
  if (irregularHoursLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'irregularHours',
      last_action_date: irregularHoursLatestUpdate,
    });
  }
  if (languagesLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'languages',
      last_action_date: languagesLatestUpdate,
    });
  }
  if (eventRelatedInfoLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'eventRelatedInfo',
      last_action_date: eventRelatedInfoLatestUpdate,
    });
  }

  const documentsMetadata = await getMetadataForServiceDocuments(service);

  taxonomySpecificAttributesUpdates.forEach((m) => {
    serviceWithAdditionalMetadata.push({
      field_name: m.field_name,
      last_action_date: m.last_action_date,
    });
  });

  const sources = [...new Set(await models.Metadata.getSourcesForResources([
    service.id,
    ...service.RegularSchedules.map(({ id }) => id),
    ...service.HolidaySchedules.map(({ id }) => id),
    ...service.Languages.map(({ id }) => id),
    ...service.EventRelatedInfos.map(({ id }) => id),
    ...service.RequiredDocuments.map(({ id }) => id),
    ...(service.DocumentsInfo ? [service.DocumentsInfo.id] : []),
  ]))];

  return {
    service: serviceWithAdditionalMetadata,
    documents: documentsMetadata,
    sources,
  };
};

export default {
  getMetadataForLocation,
  getMetadataForService,
};
