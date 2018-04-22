import Joi from 'joi';
import organizationSchemas from './validation/organizations';
import models from '../models';
import { NotFoundError } from '../utils/errors';

export default {
  find: async (req, res, next) => {
    try {
      await Joi.validate(req, organizationSchemas.find, { allowUnknown: true });

      const { searchString } = req.query;
      const filterParameters = searchString ? { searchString: searchString.trim() } : {};

      const organizations = await models.Organization.findMatching(filterParameters);
      res.send(organizations);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      await Joi.validate(req, organizationSchemas.create, { allowUnknown: true });

      const { name, description, url } = req.body;

      const createdOrganization = await models.Organization.create({
        name,
        description,
        url,
      });

      res.status(201).send(createdOrganization);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      await Joi.validate(req, organizationSchemas.update, { allowUnknown: true });

      const { organizationId } = req.params;

      const organization = await models.Organization.findById(organizationId);
      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const editableFields = ['name', 'description', 'url'];

      await organization.update(req.body, { fields: editableFields });
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
