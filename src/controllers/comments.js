import Joi from 'joi';
import commentSchemas from './validation/comments';
import models from '../models';
import { createInstance, destroyInstance } from '../services/data-changes';
import slackNotifier from '../services/slack-notifier';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const publicAttributes = ['id', 'content', 'created_at'];

      const comments = await models.Comment.findAll({
        where: { location_id: locationId, reply_to_id: null },
        attributes: publicAttributes,
        order: [['created_at', 'DESC']],
        include: [{ model: models.Comment, as: 'Replies', attributes: publicAttributes }],
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

      const postedComment = await createInstance(req.user, location.createComment.bind(location), {
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

      res.status(201).send(postedComment);
    } catch (err) {
      next(err);
    }
  },

  reply: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.reply, { allowUnknown: true });

      const { commentId } = req.params;
      const {
        content,
        postedBy,
        contactInfo,
      } = req.body;

      const originalComment = await models.Comment.findById(commentId, {
        include: { model: models.Location, include: models.Organization },
      });
      if (!originalComment) {
        throw new NotFoundError('Original comment not found');
      }

      const organizationId = originalComment.Location.organization_id;
      if (!req.userOrganizationIds || !req.userOrganizationIds.includes(organizationId)) {
        throw new ForbiddenError('Not authorized to reply on behalf of this organization');
      }

      const postedReply = await createInstance(
        req.user,
        originalComment.createReply.bind(originalComment),
        {
          content,
          posted_by: postedBy,
          contact_info: contactInfo,
          location_id: originalComment.location_id,
        },
      );

      try {
        await slackNotifier.notifyReplyToComment({
          originalComment,
          location: originalComment.Location,
          content,
          postedBy,
          contactInfo,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error notifying Slack of reply to comment', err);
      }

      res.status(201).send(postedReply);
    } catch (err) {
      next(err);
    }
  },

  delete: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.delete, { allowUnknown: true });

      const { commentId } = req.params;

      const comment = await models.Comment.findById(commentId, { include: models.Location });
      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      const organizationId = comment.Location.organization_id;

      if (!comment.reply_to_id) {
        throw new ForbiddenError('Only allowed to delete replies');
      }
      if (!req.userOrganizationIds || !req.userOrganizationIds.includes(organizationId)) {
        throw new ForbiddenError('Not authorized to delete replies for this organization');
      }

      await destroyInstance(req.user, comment);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
