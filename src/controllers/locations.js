import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
import { updateInstance, createInstance, destroyInstance } from '../services/data-changes';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';

export default {
  find: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.find, { allowUnknown: true });

      const {
        latitude,
        longitude,
        radius,
        searchString,
        taxonomyId,
      } = req.query;

      const position = geometry.createPoint(longitude, latitude);

      const filterParameters = {};
      if (searchString) {
        filterParameters.searchString = searchString.trim();
      }
      if (taxonomyId) {
        filterParameters.taxonomyId = taxonomyId.trim();
      }

      const locations = await models.Location.findAllInArea(position, radius, filterParameters);
      res.send(locations);
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
            models.Service,
            models.Comment,
            models.Organization,
            models.Phone,
            models.PhysicalAddress,
          ],
        },
      );

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const {
        PhysicalAddresses: addresses,
        ...unchangedProps
      } = location.get({ plain: true });

      if (!addresses || addresses.length !== 1) {
        throw new Error('Location does not have a valid address');
      }

      const address = addresses[0];

      const responseData = {
        ...unchangedProps,
        address: {
          street: address.address_1,
          city: address.city,
          region: address.region,
          state: address.state_province,
          postalCode: address.postal_code,
          country: address.country,
        },
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
      } = req.body;
      const position = geometry.createPoint(longitude, latitude);

      const organization = await models.Organization.findById(organizationId);
      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const LocationCreateFunction = organization.createLocation.bind(organization);
      const createdLocation = await createInstance(req, LocationCreateFunction, {
        name,
        description,
        position,
      });

      const addressCreateFunction = createdLocation.createPhysicalAddress.bind(createdLocation);
      await createInstance(req, addressCreateFunction, {
        address_1: address.street,
        city: address.city,
        region: address.region,
        state_province: address.state,
        postal_code: address.postalCode,
        country: address.country,
      });

      res.status(201).send(createdLocation);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    const updateLocation = (location, updateParams) => {
      const locationUpdate = {};
      if (updateParams.name) { locationUpdate.name = updateParams.name; }
      if (updateParams.description) { locationUpdate.description = updateParams.description; }
      if (updateParams.latitude && updateParams.longitude) {
        const { longitude, latitude } = updateParams;
        locationUpdate.position = geometry.createPoint(longitude, latitude);
      }
      if (updateParams.organizationId) {
        locationUpdate.organization_id = updateParams.organizationId;
      }

      return updateInstance(req, location, locationUpdate);
    };

    const updateAddress = (location, updateParams) => {
      if (!location.PhysicalAddresses || location.PhysicalAddresses.length !== 1) {
        throw new Error('Trying to update address for location with no valid existing address');
      }

      const currentAddress = location.PhysicalAddresses[0];

      const addressUpdate = {};
      if (updateParams.street) { addressUpdate.address_1 = updateParams.street; }
      if (updateParams.city) { addressUpdate.city = updateParams.city; }
      if (updateParams.region) { addressUpdate.region = updateParams.region; }
      if (updateParams.state) { addressUpdate.state_province = updateParams.state; }
      if (updateParams.postalCode) { addressUpdate.postal_code = updateParams.postalCode; }
      if (updateParams.country) { addressUpdate.country = updateParams.country; }

      return updateInstance(req, currentAddress, addressUpdate);
    };

    try {
      await Joi.validate(req, locationSchemas.update, { allowUnknown: true });

      const { locationId } = req.params;

      const location = await models.Location.findById(locationId, {
        include: models.PhysicalAddress,
      });

      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const updatePromises = [];

      if (req.body.address) {
        updatePromises.push(updateAddress(location, req.body.address));
      }

      updatePromises.push(updateLocation(location, req.body));

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
      } = req.body;

      const createdPhone = await createInstance(req, location.createPhone.bind(location), {
        number,
        extension,
        type,
        language,
        description,
      });

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
      await updateInstance(req, phone, req.body, { fields: editableFields });

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

      await destroyInstance(req, phone);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  addComment: async (req, res, next) => {
    try {
      const { locationId } = req.params;
      const { content, postedBy } = req.body;

      await Joi.validate(req, locationSchemas.addComment, { allowUnknown: true });

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      await createInstance(req, location.createComment.bind(location), {
        content,
        posted_by: postedBy,
      });
      res.sendStatus(201);
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
      await createInstance(req, modelCreateFunction, {
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
