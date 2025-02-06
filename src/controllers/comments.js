import Joi from 'joi';
import commentSchemas from './validation/comments';
import models from '../models';
import { createInstance, destroyInstance, updateInstance } from '../services/data-changes';
import { ForbiddenError, NotFoundError } from '../utils/errors';

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;

      const publicAttributes = ['id', 'content', 'created_at', 'hidden'];

      const comments = await models.Comment.findAllForLocation(locationId, {
        attributes: publicAttributes,
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

      const location = await models.Location.findByPk(locationId, { include: models.Organization });
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      const postedComment = await createInstance(req.user, location.createComment.bind(location), {
        content,
        posted_by: postedBy,
        contact_info: contactInfo,
      });

      res.status(201)
        .send(postedComment);
    } catch (err) {
      next(err);
    }
  },

  setEmail: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.setEmail, { allowUnknown: true });

      const { commentId } = req.params;
      const { email } = req.body;

      const comment = await models.Comment.findByPk(commentId);

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      // eslint-disable-next-line no-mixed-operators
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      if (comment.createdAt < fiveMinutesAgo) {
        throw new ForbiddenError('Comment is too old to edit');
      }

      await updateInstance(req.user, comment, { contact_info: email });
      res.sendStatus(204);
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

      const originalComment = await models.Comment.findByPk(commentId, {
        include: {
          model: models.Location,
          include: models.Organization,
        },
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

      res.status(201)
        .send(postedReply);
    } catch (err) {
      next(err);
    }
  },

  editReply: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.editReply, { allowUnknown: true });

      const { replyId } = req.params;
      const { content } = req.body;

      const reply = await models.Comment.findByPk(replyId, {
        include: {
          model: models.Location,
          include: models.Organization,
        },
      });

      if (!reply) {
        throw new NotFoundError('Reply not found');
      }

      const organizationId = reply.Location.organization_id;
      if (!req.userOrganizationIds || !req.userOrganizationIds.includes(organizationId)) {
        throw new ForbiddenError('Not authorized to reply on behalf of this organization');
      }

      await updateInstance(req.user, reply, { content });
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  delete: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.delete, { allowUnknown: true });

      const { commentId } = req.params;

      const comment = await models.Comment.findByPk(commentId, { include: models.Location });
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

  setHidden: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.setHidden, { allowUnknown: true });

      const { commentId } = req.params;
      const { hidden } = req.body;

      const comment = await models.Comment.findByPk(commentId, { include: models.Location });
      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      if (!req.userIsAdmin) {
        throw new ForbiddenError('Not authorized to hide comments');
      }

      await updateInstance(req.user, comment, { hidden });
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
};
