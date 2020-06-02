import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
import { updateInstance, createInstance, destroyInstance } from '../services/data-changes';
import { getMetadataForLocation, getMetadataForService } from '../services/last-updates';
import { eligibilityParams, documentTypes } from '../services/services';
import geometry from '../utils/geometry';
import { parseBoolean } from '../utils/strings';
import { convertKeyValueArrayToObject } from '../utils/api-params';
import { NotFoundError, ValidationError } from '../utils/errors';

const DEFAULT_MAX_LOCATIONS_RETURNED = 1000;

const isLocationClosed = (occasion, eventRelatedInfos, services) => {
  if (!occasion) {
    return false;
  }
  const hasCOVIDEventRelatedInfo = eventRelatedInfos &&
  eventRelatedInfos.some(eventRelatedInfo => eventRelatedInfo.event === occasion);
  const locationServicesAllClosed = !services ||
  services.every(service => service.HolidaySchedules.every(holidaySchedule =>
    holidaySchedule.closed));
  return hasCOVIDEventRelatedInfo && locationServicesAllClosed;
};

export default {
  find: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.find, { allowUnknown: true });

      const {
        latitude,
        longitude,
        radius,
        minResults,
        maxResults = DEFAULT_MAX_LOCATIONS_RETURNED,
        searchString,
        organizationName,
        zipcodes,
        taxonomyId,
        openAt,
        occasion,
        referralRequired,
        photoIdRequired,
        membership,
        gender,
        servesZipcode,
        taxonomySpecificAttributes,
        locationFieldsOnly,
      } = req.query;

      let attributesObject;
      if (taxonomySpecificAttributes != null) {
        try {
          attributesObject = convertKeyValueArrayToObject(taxonomySpecificAttributes);
        } catch (err) {
          throw new ValidationError(`Invalid "taxonomySpecificAttributes" param: ${err.message}`);
        }
      }

      const eligibility = {};
      if (membership != null) {
        eligibility[eligibilityParams.membership] = membership;
      }
      if (gender != null) {
        eligibility[eligibilityParams.gender] = gender;
      }

      const documents = {};
      if (referralRequired != null) {
        documents[documentTypes.referralLetter] = parseBoolean(referralRequired);
      }
      if (photoIdRequired != null) {
        documents[documentTypes.photoId] = parseBoolean(photoIdRequired);
      }

      const filterParameters = {
        documents,
        eligibility,
        occasion,
        servesZipcode,
        openAt: openAt && new Date(openAt),
        taxonomySpecificAttributes: attributesObject,
      };

      if (searchString) {
        filterParameters.searchString = searchString.trim();
      }
      if (organizationName) {
        filterParameters.organizationName = organizationName.trim();
      }
      if (zipcodes && zipcodes.length) {
        filterParameters.zipcodes = zipcodes;
      }

      if (taxonomyId) {
        const taxonomyIds = taxonomyId.split(',');
        filterParameters.taxonomyIds = await models.Taxonomy.getAllIdsWithinTaxonomies(taxonomyIds);
      }
      const locations = (await models.Location.search({
        position: (longitude && latitude) ? geometry.createPoint(longitude, latitude) : null,
        radius,
        minResults,
        maxResults,
        filterParameters,
        locationFieldsOnly,
      })).map(location => location.get({ plain: true }));

      const formattedLocations = locations.map((location) => {
        const { EventRelatedInfos, Services, ...simplifiedLocation } = location;
        const closed = isLocationClosed(occasion, EventRelatedInfos, Services);

        if (locationFieldsOnly) {
          return {
            ...simplifiedLocation,
            closed,
          };
        }

        return {
          ...location,
          closed,
        };
      });
      res.send(formattedLocations);
    } catch (err) {
      next(err);
    }
  },

  getInfo: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfo, { allowUnknown: true });

      const location = await models.Location.findById(
        req.params.locationId,
        {
          include: [
            {
              model: models.Service,
              include: [
                {
                  model: models.Eligibility,
                  include: [models.EligibilityParameter],
                },
                {
                  model: models.ServiceTaxonomySpecificAttribute,
                  include: [{ model: models.TaxonomySpecificAttribute, as: 'attribute' }],
                },
                models.Taxonomy,
                models.RegularSchedule,
                models.HolidaySchedule,
                models.Language,
                models.RequiredDocument,
                models.DocumentsInfo,
                models.Phone,
                models.EventRelatedInfo,
              ],
            },
            {
              model: models.Organization,
              include: [models.Phone],
            },
            models.Phone,
            models.PhysicalAddress,
            models.AccessibilityForDisabilities,
            models.EventRelatedInfo,
          ],
        },
      );

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const {
        PhysicalAddresses: addresses,
        Services: services,
        additional_info: additionalInfo,
        ...unchangedProps
      } = location.get({ plain: true });

      if (!addresses || addresses.length !== 1) {
        throw new Error('Location does not have a valid address');
      }

      const address = addresses[0];

      const locationMetadata = await getMetadataForLocation(location, address);
      const servicesWithMetadata = await Promise.all(services.map(async service => ({
        ...service,
        metadata: await getMetadataForService(service),
      })));

      const responseData = {
        ...unchangedProps,
        Services: servicesWithMetadata,
        additionalInfo,
        address: {
          street: address.address_1,
          city: address.city,
          region: address.region,
          state: address.state_province,
          postalCode: address.postal_code,
          country: address.country,
        },
        metadata: locationMetadata,
      };

      res.send(responseData);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.create, { allowUnknown: true });

      const {
        name,
        description,
        latitude,
        longitude,
        organizationId,
        address,
        additionalInfo,
        metadata,
      } = req.body;
      const position = geometry.createPoint(longitude, latitude);

      const organization = await models.Organization.findById(organizationId);
      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const LocationCreateFunction = organization.createLocation.bind(organization);
      const createdLocation = await createInstance(req.user, LocationCreateFunction, {
        name,
        description,
        position,
        additional_info: additionalInfo,
      }, { metadata });

      const addressCreateFunction = createdLocation.createPhysicalAddress.bind(createdLocation);
      await createInstance(req.user, addressCreateFunction, {
        address_1: address.street,
        city: address.city,
        region: address.region,
        state_province: address.state,
        postal_code: address.postalCode,
        country: address.country,
      }, { metadata });

      res.status(201).send(createdLocation);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    const updateLocation = (location, updateParams, metadata) => {
      const locationUpdate = {};
      if (updateParams.name != null) { locationUpdate.name = updateParams.name; }
      if (updateParams.description != null) {
        locationUpdate.description = updateParams.description;
      }
      if (updateParams.additionalInfo != null) {
        locationUpdate.additional_info = updateParams.additionalInfo;
      }
      if (updateParams.latitude != null && updateParams.longitude != null) {
        const { longitude, latitude } = updateParams;
        locationUpdate.position = geometry.createPoint(longitude, latitude);
      }
      if (updateParams.organizationId != null) {
        locationUpdate.organization_id = updateParams.organizationId;
      }

      return updateInstance(req.user, location, locationUpdate, { metadata });
    };

    const updateAddress = (location, updateParams, metadata) => {
      if (!location.PhysicalAddresses || location.PhysicalAddresses.length !== 1) {
        throw new Error('Trying to update address for location with no valid existing address');
      }

      const currentAddress = location.PhysicalAddresses[0];

      const addressUpdate = {};
      if (updateParams.street != null) { addressUpdate.address_1 = updateParams.street; }
      if (updateParams.city != null) { addressUpdate.city = updateParams.city; }
      if (updateParams.region != null) { addressUpdate.region = updateParams.region; }
      if (updateParams.state != null) { addressUpdate.state_province = updateParams.state; }
      if (updateParams.postalCode != null) { addressUpdate.postal_code = updateParams.postalCode; }
      if (updateParams.country != null) { addressUpdate.country = updateParams.country; }

      return updateInstance(req.user, currentAddress, addressUpdate, { metadata });
    };

    const updateEventRelatedInfo = async (location, eventRelatedInfo, metadata) => {
      await models.EventRelatedInfo.destroy({
        where: { location_id: location.id, event: eventRelatedInfo.event },
      });

      if (eventRelatedInfo.information) {
        const createFunction = models.EventRelatedInfo.create.bind(models.EventRelatedInfo);
        await createInstance(req.user, createFunction, {
          location_id: location.id,
          event: eventRelatedInfo.event,
          information: eventRelatedInfo.information,
        }, { metadata });
      }
    };

    try {
      await Joi.validate(req, locationSchemas.update, { allowUnknown: true });

      const { locationId } = req.params;
      const { metadata } = req.body;

      const location = await models.Location.findById(locationId, {
        include: models.PhysicalAddress,
      });

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const updatePromises = [];

      if (req.body.address) {
        updatePromises.push(updateAddress(location, req.body.address, metadata));
      }

      if (req.body.eventRelatedInfo) {
        updatePromises.push(updateEventRelatedInfo(location, req.body.eventRelatedInfo, metadata));
      }

      updatePromises.push(updateLocation(location, req.body, metadata));

      await Promise.all(updatePromises);

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  addPhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.addPhone, { allowUnknown: true });

      const { locationId } = req.params;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const {
        number,
        extension,
        type,
        language,
        description,
        metadata,
      } = req.body;

      const createdPhone = await createInstance(req.user, location.createPhone.bind(location), {
        number,
        extension,
        type,
        language,
        description,
      }, { metadata });

      res.status(201).send(createdPhone);
    } catch (err) {
      next(err);
    }
  },

  updatePhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.updatePhone, { allowUnknown: true });

      const { phoneId } = req.params;

      const phone = await models.Phone.findById(phoneId);
      if (!phone) {
        throw new NotFoundError('Phone not found');
      }

      const editableFields = ['number', 'extension', 'type', 'language', 'description'];
      const { metadata, ...updateParams } = req.body;
      await updateInstance(req.user, phone, updateParams, { fields: editableFields, metadata });

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  deletePhone: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.deletePhone, { allowUnknown: true });

      const { phoneId } = req.params;

      const phone = await models.Phone.findById(phoneId);
      if (!phone) {
        throw new NotFoundError('Phone not found');
      }

      await destroyInstance(req.user, phone);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  suggestNew: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.suggestNew, { allowUnknown: true });

      const {
        name,
        latitude,
        longitude,
        taxonomyIds,
      } = req.body;

      const modelCreateFunction = models.LocationSuggestion.create.bind(models.LocationSuggestion);
      await createInstance(req.user, modelCreateFunction, {
        name,
        position: geometry.createPoint(longitude, latitude),
        taxonomy_ids: taxonomyIds,
      });
      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },
};
