import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
import { updateInstance, createInstance, destroyInstance } from '../services/data-changes';
import {
  getMetadataForLocation,
  getMetadataForService,
  getLastValidatedDateForLocation,
} from '../services/last-updates';
import { eligibilityParams, documentTypes } from '../services/services';
import geometry from '../utils/geometry';
import { parseBoolean } from '../utils/strings';
import { convertKeyValueArrayToObject } from '../utils/api-params';
import { NotFoundError, ValidationError } from '../utils/errors';
import { parseNaturalLanguageQuery } from './openai';

const DEFAULT_MAX_LOCATIONS_RETURNED = 1000;
const MAX_TAXONOMY_IDS = 200;

const CLOSURE_EVENT_TYPE = 'CLOSURE';

const isLocationClosed = (eventRelatedInfos) => {
  if (!eventRelatedInfos) {
    return false;
  }
  return eventRelatedInfos.some(info => info.event === CLOSURE_EVENT_TYPE);
};

// Get location and service associations separately to reduce SQL size
// (avoids 16KB+ queries, which would result in session pinning)
const locationAssociations = {
  include: [
    {
      model: models.Organization,
      include: [models.Phone],
    },
    models.Phone,
    models.PhysicalAddress,
    models.AccessibilityForDisabilities,
    models.EventRelatedInfo,
  ],
};
const serviceAssociations = {
  include: [
    {
      model: models.Eligibility,
      include: [models.EligibilityParameter],
    },
    {
      model: models.ServiceTaxonomySpecificAttribute,
      include: [{ model: models.TaxonomySpecificAttribute, as: 'attribute' }],
    },
    {
      model: models.Taxonomy,
      through: { attributes: [] },
    },
    models.RegularSchedule,
    models.HolidaySchedule,
    {
      model: models.Language,
      through: { attributes: [] },
    },
    models.RequiredDocument,
    models.DocumentsInfo,
    models.Phone,
    models.EventRelatedInfo,
    models.ServiceArea,
  ],
};

const getNeighborhoodAttributeSubquery = {
  attributes: {
    include: [
      [
        models.sequelize.literal(`(
            SELECT neighborhood
            FROM nyc_neighborhood_geometries
            WHERE ST_Contains(
              nyc_neighborhood_geometries.geometry,
              ST_SetSRID(position,4326)
            )
        )`),
        'neighborhood',
      ],
    ],
  },
};

async function handleGetInfoResponse(location, locationWithServices, excludeMetadata) {
  const {
    PhysicalAddresses: addresses,
    additional_info: additionalInfo,
    ...unchangedProps
  } = location.get({ plain: true });
  const services = locationWithServices && locationWithServices.Services
    ? locationWithServices.Services.map(s => s.get({ plain: true }))
    : [];

  if (!addresses || addresses.length !== 1) {
    throw new Error('Location does not have a valid address');
  }

  const address = addresses[0];

  const responseData = {
    ...unchangedProps,
    additionalInfo,
    address: {
      street: address.address_1,
      city: address.city,
      region: address.region,
      state: address.state_province,
      postalCode: address.postal_code,
      country: address.country,
      neighborhood: address.neighborhood,
    },
  };

  const { EventRelatedInfos } = location;
  const closed = isLocationClosed(EventRelatedInfos);

  if (excludeMetadata) {
    const [{ lastValidatedDateForLocation }] = await getLastValidatedDateForLocation(location.id);
    return {
      ...responseData,
      Services: services,
      lastValidatedDateForLocation,
      closed,
    };
  }
  const locationMetadata = await getMetadataForLocation(location, address);
  const servicesWithMetadata = await Promise.all(services.map(async service => ({
    ...service,
    metadata: await getMetadataForService(service),
  })));

  return {
    ...responseData,
    Services: servicesWithMetadata,
    metadata: locationMetadata,
    closed,
  };
}

export default {
  find: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.find, { allowUnknown: true });

      const {
        latitude,
        longitude,
        noServices,
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
        age: _age,
        ageMin: _ageMin,
        ageMax: _ageMax,
        taxonomySpecificAttributes,
        locationFieldsOnly,
        pageNumber: _pageNumber,
        pageSize: _pageSize,
        sortBy,
        naturalLanguageQuery,
      } = req.query;

      const pageNumber = _pageNumber ? parseInt(_pageNumber, 10) : undefined;
      const pageSize = _pageNumber ? parseInt(_pageSize, 10) : undefined;
      const age = _age ? parseInt(_age, 10) : undefined;
      const ageMin = _ageMin ? parseInt(_ageMin, 10) : undefined;
      const ageMax = _ageMax ? parseInt(_ageMax, 10) : undefined;

      if (ageMin != null && ageMax != null && ageMin > ageMax) {
        throw new ValidationError('ageMin cannot be greater than ageMax');
      }

      let nlParams = null;
      if (naturalLanguageQuery) {
        try {
          nlParams = await parseNaturalLanguageQuery(naturalLanguageQuery, new Date().toISOString());
        } catch (err) {
          console.error('NL query parse failed, falling back to raw search:', err.message);
        }
      }

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
      if (age != null) {
        eligibility.age = age;
      } else if (ageMin != null || ageMax != null) {
        eligibility.ageRange = { ageMin, ageMax };
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

      if (nlParams) {
        if (!searchString && nlParams.searchString) {
          filterParameters.searchString = nlParams.searchString;
        }
        if (!openAt && nlParams.openAt) {
          filterParameters.openAt = new Date(nlParams.openAt);
        }
        if (!gender && nlParams.gender) {
          filterParameters.eligibility[eligibilityParams.gender] = nlParams.gender;
        }
        if (membership == null && nlParams.membership != null) {
          filterParameters.eligibility[eligibilityParams.membership] = nlParams.membership;
        }
        if (ageMin == null && ageMax == null && age == null) {
          if (nlParams.ageMin != null || nlParams.ageMax != null) {
            filterParameters.eligibility.ageRange = {
              ageMin: nlParams.ageMin,
              ageMax: nlParams.ageMax,
            };
          }
        }
        if (referralRequired == null && nlParams.referralRequired != null) {
          filterParameters.documents[documentTypes.referralLetter] = nlParams.referralRequired;
        }
        if (photoIdRequired == null && nlParams.photoIdRequired != null) {
          filterParameters.documents[documentTypes.photoId] = nlParams.photoIdRequired;
        }
        if (!servesZipcode && nlParams.servesZipcode) {
          filterParameters.servesZipcode = nlParams.servesZipcode;
        }
        if (!taxonomyId && nlParams.taxonomyNames && nlParams.taxonomyNames.length > 0) {
          const matchedTaxonomies = await models.Taxonomy.findAll({
            where: { name: nlParams.taxonomyNames },
          });
          if (matchedTaxonomies.length > 0) {
            const matchedIds = matchedTaxonomies.map(t => t.id);
            filterParameters.taxonomyIds = await models.Taxonomy.getAllIdsWithinTaxonomies(matchedIds);
          }
        }
      } else if (naturalLanguageQuery && !searchString) {
        filterParameters.searchString = naturalLanguageQuery.trim();
      }

      if (taxonomyId) {
        const taxonomyIds = taxonomyId.split(',').filter(Boolean);
        if (taxonomyIds.length > MAX_TAXONOMY_IDS) {
          const message = `taxonomyId query param may include at most ${MAX_TAXONOMY_IDS} IDs`;
          throw new ValidationError(message);
        }
        filterParameters.taxonomyIds = await models.Taxonomy.getAllIdsWithinTaxonomies(taxonomyIds);
      }
      const limit = pageSize || maxResults;

      const offset = pageNumber !== undefined && pageSize !== undefined ?
        pageNumber * pageSize : undefined;

      const {
        locations,
        totalNumLocations,
      } = await models.Location.search({
        position: (longitude && latitude) ? geometry.createPoint(longitude, latitude) : null,
        radius,
        minResults,
        filterParameters,
        locationFieldsOnly,
        noServices: parseBoolean(noServices),
        limit,
        offset,
        sortBy,
      });
      const plainLocations = await locations
        .map(location => location.get({ plain: true }));
      const paginationCount = Math.ceil(totalNumLocations / pageSize);

      const formattedLocations = plainLocations.map((location) => {
        // eslint-disable-next-line no-unused-vars
        const { EventRelatedInfos, Services: _Services, ...simplifiedLocation } = location;
        const closed = isLocationClosed(EventRelatedInfos);

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

      if (pageNumber !== undefined && pageSize !== undefined) {
        res.setHeader('Pagination-Count', paginationCount);
        res.setHeader('Total-Count', totalNumLocations);
      }
      res.send(formattedLocations);
    } catch (err) {
      next(err);
    }
  },

  getInfo: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfo, { allowUnknown: true });

      const { locationId } = req.params;

      const [location, locationWithServices] = await Promise.all([
        models.Location.findByPk(
          locationId,
          {
            include: locationAssociations.include,
            attributes: getNeighborhoodAttributeSubquery.attributes,
          },
        ),
        models.Location.findByPk(
          locationId,
          {
            include: [{
              model: models.Service,
              through: { attributes: [] },
              include: serviceAssociations.include,
            }],
            attributes: ['id'],
          },
        ),
      ]);

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const getInfoResponse = await handleGetInfoResponse(location, locationWithServices, false);
      res.send(getInfoResponse);
    } catch (err) {
      next(err);
    }
  },

  getInfoBySlug: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfoBySlug, { allowUnknown: true });

      const locations = await models.Location.findAll({
        where: {
          slug: req.params.slug,
        },
        include: locationAssociations.include,
        attributes: getNeighborhoodAttributeSubquery.attributes,
      });

      if (!locations.length) {
        res.status(404).send({ status: 404 });
        return;
      }

      const location = locations[0];

      const locationWithServices = await models.Location.findByPk(
        location.id,
        {
          include: [{
            model: models.Service,
            through: { attributes: [] },
            include: serviceAssociations.include,
          }],
          attributes: ['id'],
        },
      );

      const getInfoResponse = await handleGetInfoResponse(location, locationWithServices, true);
      res.send(getInfoResponse);
    } catch (err) {
      next(err);
    }
  },

  getRedirectBySlug: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.getInfoBySlug, { allowUnknown: true });

      const locationSlugs = await models.LocationSlugRedirect.findAll({
        where: {
          slug: req.params.slug,
        },
        attributes: ['slug', 'location_id'],
      });

      if (locationSlugs.length) {
        const location = await models.Location.findByPk(locationSlugs[0].location_id);
        if (!location) {
          res.status(404).send({ error: 'Location not found' });
          return;
        }

        res.send({
          id: location.id,
          slug: location.slug,
        });
      } else {
        res.status(404).send({ error: 'Location slug not found' });
      }
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

      const organization = await models.Organization.findByPk(organizationId);
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
      if (updateParams.streetview_url != null) {
        locationUpdate.streetview_url = updateParams.streetview_url;
      }
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

      const location = await models.Location.findByPk(locationId, {
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

      const location = await models.Location.findByPk(locationId);
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

      const phone = await models.Phone.findByPk(phoneId);
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

      const phone = await models.Phone.findByPk(phoneId);
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
