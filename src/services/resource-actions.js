import Joi from 'joi';

import serviceSchemas from '../controllers/validation/services';
import locationSchemas from '../controllers/validation/locations';
import organizationSchemas from '../controllers/validation/organizations';
import models from '../models';
import { updateInstance, createInstance, destroyInstance } from './data-changes';
import { updateService, deleteService } from './services';
import geometry from '../utils/geometry';
import { NotFoundError, ValidationError } from '../utils/errors';

const RESOURCE_ALIASES = {
  service: 'services',
  services: 'services',
  phone: 'phones',
  phones: 'phones',
  location: 'locations',
  locations: 'locations',
  organization: 'organizations',
  organizations: 'organizations',
  physical_address: 'physical_addresses',
  physical_addresses: 'physical_addresses',
  physicalAddress: 'physical_addresses',
  physicalAddresses: 'physical_addresses',
};

export const SUPPORTED_PATCH_RESOURCES = [
  'services',
  'locations',
  'phones',
  'organizations',
  'physical_addresses',
];

export const SUPPORTED_DELETE_RESOURCES = [
  'services',
  'phones',
];

export const normalizeResource = (resource) => {
  const normalized = RESOURCE_ALIASES[String(resource || '').trim()];
  if (!normalized) {
    throw new ValidationError(`Unsupported scheduled action resource: ${resource}`);
  }
  return normalized;
};

const validate = (target, schema) => Joi.validate(target, schema, { allowUnknown: true });

const getLocationModel = () => (
  models.Location.unscoped ? models.Location.unscoped() : models.Location
);

const getLocationUpdate = (updateParams) => {
  const locationUpdate = {};
  if (updateParams.name !== undefined) { locationUpdate.name = updateParams.name; }
  if (updateParams.description !== undefined) {
    locationUpdate.description = updateParams.description;
  }
  if (updateParams.additionalInfo !== undefined) {
    locationUpdate.additional_info = updateParams.additionalInfo;
  }
  if (updateParams.additional_info !== undefined) {
    locationUpdate.additional_info = updateParams.additional_info;
  }
  if (updateParams.streetviewUrl !== undefined) {
    locationUpdate.streetview_url = updateParams.streetviewUrl;
  }
  if (updateParams.streetview_url !== undefined) {
    locationUpdate.streetview_url = updateParams.streetview_url;
  }
  if (updateParams.hiddenFromSearch !== undefined) {
    locationUpdate.hidden_from_search = updateParams.hiddenFromSearch;
  }
  if (updateParams.hidden_from_search !== undefined) {
    locationUpdate.hidden_from_search = updateParams.hidden_from_search;
  }
  if (updateParams.latitude !== undefined && updateParams.longitude !== undefined) {
    locationUpdate.position = geometry.createPoint(updateParams.longitude, updateParams.latitude);
  }
  if (updateParams.organizationId !== undefined) {
    locationUpdate.organization_id = updateParams.organizationId;
  }
  if (updateParams.organization_id !== undefined) {
    locationUpdate.organization_id = updateParams.organization_id;
  }
  return locationUpdate;
};

const getAddressUpdate = (updateParams) => {
  const addressUpdate = {};
  if (updateParams.street !== undefined) { addressUpdate.address_1 = updateParams.street; }
  if (updateParams.address1 !== undefined) { addressUpdate.address_1 = updateParams.address1; }
  if (updateParams.address_1 !== undefined) {
    addressUpdate.address_1 = updateParams.address_1;
  }
  if (updateParams.city !== undefined) { addressUpdate.city = updateParams.city; }
  if (updateParams.region !== undefined) { addressUpdate.region = updateParams.region; }
  if (updateParams.state !== undefined) {
    addressUpdate.state_province = updateParams.state;
  }
  if (updateParams.stateProvince !== undefined) {
    addressUpdate.state_province = updateParams.stateProvince;
  }
  if (updateParams.state_province !== undefined) {
    addressUpdate.state_province = updateParams.state_province;
  }
  if (updateParams.postalCode !== undefined) {
    addressUpdate.postal_code = updateParams.postalCode;
  }
  if (updateParams.postal_code !== undefined) {
    addressUpdate.postal_code = updateParams.postal_code;
  }
  if (updateParams.country !== undefined) { addressUpdate.country = updateParams.country; }
  return addressUpdate;
};

const patchService = async (resourceId, payload, user) => {
  await validate({ params: { serviceId: resourceId }, body: payload }, serviceSchemas.update);

  const {
    metadata, taxonomyId: camelTaxonomyId, taxonomy_id: snakeTaxonomyId, ...otherProps
  } =
    payload;
  const taxonomyId = camelTaxonomyId || snakeTaxonomyId;

  const service = await models.Service.findByPk(resourceId, {
    include: [models.DocumentsInfo],
  });
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  if (!service.DocumentsInfo) {
    throw new Error('Service has no valid information about required documents');
  }

  let taxonomy = null;
  if (taxonomyId) {
    taxonomy = await models.Taxonomy.findByPk(taxonomyId);
    if (!taxonomy) {
      throw new NotFoundError('Taxonomy not found');
    }
  }

  await updateService(service, { ...otherProps, taxonomy }, user, metadata);
};

const updateLocationAddress = async (location, address, user, metadata, transaction) => {
  if (!location.PhysicalAddresses || location.PhysicalAddresses.length !== 1) {
    throw new Error('Trying to update address for location with no valid existing address');
  }

  const currentAddress = location.PhysicalAddresses[0];
  const addressUpdate = getAddressUpdate(address);

  if (!Object.keys(addressUpdate).length) {
    return;
  }

  await updateInstance(user, currentAddress, addressUpdate, { transaction, metadata });
};

const updateLocationEventRelatedInfo = async (
  location,
  eventRelatedInfo,
  user,
  metadata,
  transaction,
) => {
  await models.EventRelatedInfo.destroy({
    where: { location_id: location.id, event: eventRelatedInfo.event },
    transaction,
  });

  if (eventRelatedInfo.information) {
    const createFunction = models.EventRelatedInfo.create.bind(models.EventRelatedInfo);
    await createInstance(user, createFunction, {
      location_id: location.id,
      event: eventRelatedInfo.event,
      information: eventRelatedInfo.information,
    }, { transaction, metadata });
  }
};

const patchLocation = async (resourceId, payload, user) => {
  await validate({ params: { locationId: resourceId }, body: payload }, locationSchemas.update);

  const location = await getLocationModel().findByPk(resourceId, {
    include: [models.PhysicalAddress],
  });
  if (!location) {
    throw new NotFoundError('Location not found');
  }

  const { metadata } = payload;
  const locationUpdate = getLocationUpdate(payload);

  await models.sequelize.transaction(async (transaction) => {
    const updatePromises = [];

    if (Object.keys(locationUpdate).length) {
      updatePromises.push(updateInstance(
        user,
        location,
        locationUpdate,
        { transaction, metadata },
      ));
    }

    if (payload.address) {
      updatePromises.push(updateLocationAddress(
        location,
        payload.address,
        user,
        metadata,
        transaction,
      ));
    }

    if (payload.eventRelatedInfo) {
      updatePromises.push(updateLocationEventRelatedInfo(
        location,
        payload.eventRelatedInfo,
        user,
        metadata,
        transaction,
      ));
    }

    await Promise.all(updatePromises);
  });
};

const patchPhone = async (resourceId, payload, user) => {
  await validate({ params: { phoneId: resourceId }, body: payload }, locationSchemas.updatePhone);

  const phone = await models.Phone.findByPk(resourceId);
  if (!phone) {
    throw new NotFoundError('Phone not found');
  }

  const editableFields = ['number', 'extension', 'type', 'language', 'description'];
  const { metadata, ...updateParams } = payload;
  await updateInstance(user, phone, updateParams, { fields: editableFields, metadata });
};

const patchOrganization = async (resourceId, payload, user) => {
  await validate(
    { params: { organizationId: resourceId }, body: payload },
    organizationSchemas.update,
  );

  const organization = await models.Organization.findByPk(resourceId);
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const editableFields = ['name', 'description', 'url', 'email'];
  const { metadata, ...updateParams } = payload;
  await updateInstance(
    user,
    organization,
    updateParams,
    { fields: editableFields, metadata },
  );
};

const patchPhysicalAddress = async (resourceId, payload, user) => {
  const address = await models.PhysicalAddress.findByPk(resourceId);
  if (!address) {
    throw new NotFoundError('Physical address not found');
  }

  const { metadata } = payload;
  const addressUpdate = getAddressUpdate(payload);

  if (Object.keys(addressUpdate).length) {
    await updateInstance(user, address, addressUpdate, { metadata });
  }
};

export const patchResource = async (resource, resourceId, payload, user) => {
  const normalizedResource = normalizeResource(resource);

  if (normalizedResource === 'services') return patchService(resourceId, payload, user);
  if (normalizedResource === 'locations') return patchLocation(resourceId, payload, user);
  if (normalizedResource === 'phones') return patchPhone(resourceId, payload, user);
  if (normalizedResource === 'organizations') return patchOrganization(resourceId, payload, user);
  if (normalizedResource === 'physical_addresses') {
    return patchPhysicalAddress(resourceId, payload, user);
  }

  throw new ValidationError(`PATCH is not supported for ${normalizedResource}`);
};

export const deleteResource = async (resource, resourceId, user) => {
  const normalizedResource = normalizeResource(resource);

  if (normalizedResource === 'services') {
    await validate({ params: { serviceId: resourceId } }, serviceSchemas.delete);
    await deleteService(resourceId, user);
    return;
  }

  if (normalizedResource === 'phones') {
    await validate({ params: { phoneId: resourceId } }, locationSchemas.deletePhone);

    const phone = await models.Phone.findByPk(resourceId);
    if (!phone) {
      throw new NotFoundError('Phone not found');
    }

    await destroyInstance(user, phone);
    return;
  }

  throw new ValidationError(`DELETE is not supported for ${normalizedResource}`);
};

export const executeResourceAction = async ({
  method,
  resource,
  resourceId,
  payload,
  user,
}) => {
  const normalizedMethod = String(method || '').trim().toUpperCase();

  if (normalizedMethod === 'PATCH') {
    return patchResource(resource, resourceId, payload || {}, user);
  }

  if (normalizedMethod === 'DELETE') {
    return deleteResource(resource, resourceId, user);
  }

  throw new ValidationError(`Unsupported scheduled action method: ${method}`);
};

export default {
  executeResourceAction,
  patchResource,
  deleteResource,
  normalizeResource,
  SUPPORTED_PATCH_RESOURCES,
  SUPPORTED_DELETE_RESOURCES,
};
