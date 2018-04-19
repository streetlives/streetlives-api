import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
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
        { include: [models.Service, models.Comment, models.Organization, models.Phone, models.PhysicalAddress] },
      );
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      res.send(location);
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

      const createdLocation = await organization.createLocation({
        name,
        description,
        position,
        PhysicalAddresses: [{
          address_1: address.street,
          city: address.city,
          region: address.region,
          state_province: address.state,
          postal_code: address.postalCode,
          country: address.country,
        }],
      }, { include: models.PhysicalAddress });

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
      if (updateParams.latitude) { locationUpdate.latitude = updateParams.latitude; }
      if (updateParams.longitude) { locationUpdate.longitude = updateParams.longitude; }
      if (updateParams.organizationId) {
        locationUpdate.organization_id = updateParams.organizationId;
      }

      return location.update(locationUpdate);
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

      return currentAddress.update(addressUpdate);
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

      const createdPhone = await location.createPhone({
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
      await phone.update(req.body, { fields: editableFields });

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

      await phone.destroy();
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

      await location.createComment({
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

      await models.LocationSuggestion.create({
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
