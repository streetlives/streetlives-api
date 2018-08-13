import Joi from 'joi';
import commentSchemas from './validation/comments';
import models from '../models';
import { createInstance } from '../services/data-changes';
import slackNotifier from '../services/slack-notifier';
import { NotFoundError } from '../utils/errors';

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const comments = await models.Comment.findAll({
        where: { location_id: locationId },
        attributes: ['id', 'content', 'created_at'],
        order: [['created_at', 'DESC']],
      });
      res.send(comments);
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

      const location = await models.Location.findById(locationId, { include: models.Organization });
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      await createInstance(req.user, location.createComment.bind(location), {
        content,
        posted_by: postedBy,
        contact_info: contactInfo,
      });

      try {
        await slackNotifier.notifyNewComment({
          location,
          content,
          postedBy,
          contactInfo,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error notifying Slack of new comment', err);
      }

      res.sendStatus(201);
    } catch (err) {
      next(err);
    }
  },
};
