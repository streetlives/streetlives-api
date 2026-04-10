import Joi from 'joi';
import serviceSchemas from './validation/services';
import models, { sequelize } from '../models';
import { createService, updateService, deleteService } from '../services/services';
import {
  upsertWebsiteDataForLocation,
  upsertWebsiteDataForService,
} from '../services/location-website-data';
import { NotFoundError } from '../utils/errors';

export default {
  create: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.create, { allowUnknown: true });

      const {
        metadata,
        taxonomyId,
        locationId,
        ...otherProps
      } = req.body;

      const location = await models.Location.findByPk(locationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const taxonomy = await models.Taxonomy.findByPk(taxonomyId);
      if (!taxonomy) {
        throw new NotFoundError('Taxonomy not found');
      }

      const createdService = await createService(
        location,
        { ...otherProps, taxonomy },
        req.user,
        metadata,
      );
      await upsertWebsiteDataForLocation(locationId);
      res.status(201).send(createdService);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.update, { allowUnknown: true });

      const { serviceId } = req.params;
      const { metadata, taxonomyId, ...otherProps } = req.body;

      const service = await models.Service.findByPk(serviceId, {
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

      await updateService(service, { ...otherProps, taxonomy }, req.user, metadata);
      await upsertWebsiteDataForService(serviceId);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  delete: async (req, res, next) => {
    try {
      await Joi.validate(req, serviceSchemas.delete, { allowUnknown: true });
      const { serviceId } = req.params;
      const service = await models.Service.findByPk(serviceId, {
        include: [{
          model: models.Location,
          through: { attributes: [] },
          attributes: ['id'],
        }],
      });
      const relatedLocationIds = service ? service.Locations.map(location => location.id) : [];
      await deleteService(serviceId, req.user);
      const websiteDataUpdates = relatedLocationIds
        .map(locationId => upsertWebsiteDataForLocation(locationId));
      await Promise.all(websiteDataUpdates);

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  getCount: async (req, res, next) => {
    try {
      const serviceCountQuery = `
          select count(*)
          from locations
                 join organizations o on o.id = locations.organization_id
                 join service_at_locations sal on sal.location_id = locations.id
                 join services on services.id = sal.service_id
          where exists (
            select hs.id
            from holiday_schedules as hs
                   join service_at_locations as sal on sal.service_id = hs.service_id
            where sal.location_id = locations.id
          )    `;
      const [servicesCount] = await sequelize.query(serviceCountQuery);
      res.send(servicesCount[0]).status(200);
    } catch (err) {
      next(err);
    }
  },
};
