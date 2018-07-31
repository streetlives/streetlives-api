import Joi from 'joi';
import commentSchemas from './validation/comments';
import models from '../models';
import { createInstance } from '../services/data-changes';
import { NotFoundError } from '../utils/errors';

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const location = await models.Location.findById(locationId, {
        include: models.Comment,
      });
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      res.send(location.Comments);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.create, { allowUnknown: true });

      const {
        locationId,
        content,
        postedBy,
        contactInfo,
      } = req.body;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      await createInstance(req.user, location.createComment.bind(location), {
        content,
        posted_by: postedBy,
        contact_info: contactInfo,
      });
      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },
};
