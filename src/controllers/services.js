import Joi from 'joi';
import serviceSchemas from './validation/services';
import models from '../models';
import { createService, updateService } from '../services/services';
import { NotFoundError } from '../utils/errors';

export default {
  create: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.create, { allowUnknown: true });

      const { taxonomyId, locationId, ...otherProps } = req.body;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const taxonomy = await models.Taxonomy.findById(taxonomyId);
      if (!taxonomy) {
        throw new NotFoundError('Taxonomy not found');
      }

      const createdService = await createService({ ...otherProps, location, taxonomy }, req.user);
      res.status(201).send(createdService);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.update, { allowUnknown: true });

      const { serviceId } = req.params;
      const { taxonomyId, ...otherProps } = req.body;

      const service = await models.Service.findById(serviceId);
      if (!service) {
        throw new NotFoundError('Service not found');
      }

      let taxonomy = null;
      if (taxonomyId) {
        taxonomy = await models.Taxonomy.findById(taxonomyId);
        if (!taxonomy) {
          throw new NotFoundError('Taxonomy not found');
        }
      }

      await updateService(service, { ...otherProps, taxonomy }, req.user);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
