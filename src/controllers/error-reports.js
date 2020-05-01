import Joi from 'joi';
import errorReportSchemas from './validation/error-report';
import models from '../models';
import { createInstance, destroyInstance } from '../services/data-changes';
import slackNotifier from '../services/slack-notifier';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, errorReportSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const publicAttributes = [
        'id',
        'content',
        'location_general_report',
        'services', 'created_at',
      ];

      const errorReports = await models.ErrorReport.findAllForLocation(locationId, {
        attributes: publicAttributes,
        order: [['created_at', 'DESC']],
      });
      res.send(errorReports);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      await Joi.validate(req, errorReportSchemas.create, { allowUnknown: true });

      const {
        locationId,
        content,
      } = req.body;

      // Parse certain values before sending to 'createInstance' in data-changes.js
      // Perhaps find more elequent of checking for null values?
      const services = req.body.services
        ? JSON.parse(req.body.services)
        : [];

      const general = req.body.general
        ? JSON.parse(req.body.general)
        : false;

      const location = await models.Location.findById(locationId, { include: models.Organization });

      if (!location) {
        throw new NotFoundError('Location not found when attempting to create new error report!');
      }

      // Perhaps change 'values' object so it's dynamic based on req.body?
      // Would need to validate list, however.
      const postedErrorReport = await createInstance(
        req.user,
        location.createErrorReport.bind(location), {
          content,
          general,
          services,
        },
      );

      try {
        await slackNotifier.notifyErrorReport({
          location,
          general,
          services,
          content,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error notifying Slack of new error report!', err);
      }

      res.status(201).send(postedErrorReport);
    } catch (err) {
      next(err);
    }
  },

  delete: async (req, res, next) => {
    try {
      await Joi.validate(req, errorReportSchemas.delete, { allowUnknown: true });

      const { errorReportId } = req.params;

      const errorReport = await models.ErrorReport.findById(errorReportId, {
        include: models.Location,
      });

      if (!errorReport) {
        throw new NotFoundError('Error report not found when attempting to delete it!');
      }

      if (!req.userIsAdmin) {
        throw new ForbiddenError('Not authorized to delete error reports!');
      }

      await destroyInstance(req.user, errorReport);

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
