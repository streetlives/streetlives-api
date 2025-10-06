import models from '../models';

const LAST_VALIDATED_DATE_FOR_LOCATION_BASE_QUERY = ` 
    select max(metadata.created_at) as "lastValidatedDateForLocation"
    from locations
    left join service_at_locations sal on sal.location_id = locations.id
    left join services on sal.service_id = services.id
    left join service_languages on service_languages.service_id = services.id
    left join holiday_schedules on holiday_schedules.service_id = services.id
    left join service_areas on service_areas.service_id = services.id
    left join eligibility on eligibility.service_id = services.id
    left join service_taxonomy_specific_attributes 
      on service_taxonomy_specific_attributes.service_id = services.id
    left join required_documents on required_documents.service_id = services.id
    left join documents_infos on documents_infos.service_id = services.id
    left join phones on (phones.service_id = services.id or phones.location_id = locations.id)
    left join event_related_info on 
      (event_related_info.service_id = services.id or 
        event_related_info.location_id = locations.id)
    left join accessibility_for_disabilities on 
      accessibility_for_disabilities.location_id = locations.id
    join metadata on (
      (metadata.resource_table = 'locations' 
        and metadata.resource_id = locations.id) or
      (metadata.resource_table = 'accessibility_for_disabilities' and 
        metadata.resource_id = accessibility_for_disabilities.id) or
      (metadata.resource_table = 'service_languages' and 
        metadata.resource_id = service_languages.id) or
      (metadata.resource_table = 'holiday_schedules' and 
        metadata.resource_id = holiday_schedules.id) or
      (metadata.resource_table = 'service_areas' and 
        metadata.resource_id = service_areas.id) or
      (metadata.resource_table = 'eligibility' and 
        metadata.resource_id = eligibility.id) or
      (metadata.resource_table = 'service_taxonomy_specific_attributes' and 
        metadata.resource_id = service_taxonomy_specific_attributes.id) or
      (metadata.resource_table = 'required_documents' and 
        metadata.resource_id = required_documents.id) or
      (metadata.resource_table = 'documents_infos' and 
        metadata.resource_id = documents_infos.id) or
      (metadata.resource_table = 'phones' and 
        metadata.resource_id = phones.id) or
      (metadata.resource_table = 'event_related_info' and 
        metadata.resource_id = event_related_info.id) or
      (metadata.resource_table = 'services' and 
        metadata.resource_id = services.id)
    )
    where locations.id = $1
`;

export const getLastValidatedDateForLocation = async locationId => models.sequelize.query(
  // Here's what's going on with this query:
  // We use CTE in order to execute a less expensive query,
  // by adding AND clause to the where statement.
  // Then we use case expression,
  // so that we execute more expensive query conditionally
  // if the less expensive query failed to find a result.
  `
  with last_validated_date_for_location as (
    ${LAST_VALIDATED_DATE_FOR_LOCATION_BASE_QUERY}
    AND metadata.created_at > now() - interval '1 year'
  ) select 
    case 
      when "lastValidatedDateForLocation" is not null then "lastValidatedDateForLocation" 
      else (${LAST_VALIDATED_DATE_FOR_LOCATION_BASE_QUERY})
    end
  from last_validated_date_for_location
    `,
  {
    bind: [locationId],
    type: models.Sequelize.QueryTypes.SELECT,
  },
);

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
    models.Metadata.getLastUpdateDatesForResourceFields(location.organization_id),
    models.Metadata.getLastUpdateDatesForResourceFields(address.id),
    models.Metadata.getLatestUpdateDateForResources(phoneIds),
    models.Metadata.getLatestUpdateDateForResources(eventRelatedInfoIds),
  ]);

  const sources = [...new Set(await models.Metadata.getSourcesForResources([
    location.id,
    location.organization_id,
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
    eligibilityMetaDataUpdate
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
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'eligibility',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
  ]);

  const serviceWithAdditionalMetadata = [...serviceMetadata];


  if(eligibilityMetaDataUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'who_does_it_serve',
      last_action_date: eligibilityMetaDataUpdate
    })
  }
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
