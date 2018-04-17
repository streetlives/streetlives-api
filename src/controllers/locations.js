import Joi from 'joi';
import locationSchemas from './validation/locations';
import models from '../models';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';

// TODO: Add support for PhysicalAdddress.
// TODO: Should position and address changes be allowed separately? Should geocoding even be on FE?
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
        { include: [models.Service, models.Comment] },
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
      });

      res.status(201).send(createdLocation);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      await Joi.validate(req, locationSchemas.update, { allowUnknown: true });

      const { locationId } = req.params;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const editableFields = ['name', 'description', 'latitude', 'longitude', 'organization_id'];
      const update = {
        ...req.body,
        organization_id: req.body.organizationId,
      };

      await location.update(update, { fields: editableFields });

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
