import Joi from 'joi';
import serviceSchemas from './validation/services';
import models from '../models';
import { NotFoundError } from '../utils/errors';

// TODO: Add support for at least Language, Schedule.
export default {
  create: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.create, { allowUnknown: true });

      const {
        name,
        description,
        url,
        taxonomyId,
        locationId,
      } = req.body;

      const location = await models.Location.findById(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const taxonomy = await models.Taxonomy.findById(taxonomyId);
      if (!taxonomy) {
        throw new NotFoundError('Taxonomy not found');
      }

      const createdService = await location.createService({
        name,
        description,
        url,
        organization_id: location.organization_id,
      });

      await createdService.setTaxonomies([taxonomy]);

      res.status(201).send(createdService);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.update, { allowUnknown: true });

      const { serviceId } = req.params;

      const service = await models.Service.findById(serviceId);
      if (!service) {
        throw new NotFoundError('Service not found');
      }

      const { taxonomyId } = req.body;
      if (taxonomyId) {
        const taxonomy = await models.Taxonomy.findById(taxonomyId);
        if (!taxonomy) {
          throw new NotFoundError('Taxonomy not found');
        }

        await service.setTaxonomies([taxonomy]);
      }

      const editableFields = ['name', 'description', 'url'];

      await service.update(req.body, { fields: editableFields });

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
