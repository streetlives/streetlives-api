import models from '../models';

export const getMetadataForLocation = async (location, address) => {
  const [
    locationMetadata,
    organizationMetadata,
    addressMetadata,
    phonesLatestUpdate,
  ] = await Promise.all([
    models.Metadata.getLastUpdateDatesForResourceFields(location.id),
    models.Metadata.getLastUpdateDatesForResourceFields(location.organization_id),
    models.Metadata.getLastUpdateDatesForResourceFields(address.id),
    models.Metadata.getLatestUpdateDateForResources(location.Phones.map(phone => phone.id)),
  ]);

  const locationWithPhonesMetadata = phonesLatestUpdate ? [
    ...locationMetadata,
    { field_name: 'phones', last_action_date: phonesLatestUpdate },
  ] : locationMetadata;

  return {
    location: locationWithPhonesMetadata,
    organization: organizationMetadata,
    address: addressMetadata,
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
    languagesLatestUpdate,
  ] = await Promise.all([
    models.Metadata.getLastUpdateDatesForResourceFields(service.id),
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'regular_schedules',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
    models.Metadata.getLatestUpdateDateForQuery({
      resource_table: 'service_languages',
      field_name: 'service_id',
      replacement_value: service.id,
    }),
  ]);

  const serviceWithAdditionalMetadata = [...serviceMetadata];
  if (hoursLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'hours',
      last_action_date: hoursLatestUpdate,
    });
  }
  if (languagesLatestUpdate) {
    serviceWithAdditionalMetadata.push({
      field_name: 'languages',
      last_action_date: languagesLatestUpdate,
    });
  }

  const documentsMetadata = await getMetadataForServiceDocuments(service);

  return {
    service: serviceWithAdditionalMetadata,
    documents: documentsMetadata,
  };
};

export default {
  getMetadataForLocation,
  getMetadataForService,
};
