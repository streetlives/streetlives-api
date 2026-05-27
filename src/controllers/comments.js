import Joi from 'joi';
import { col, fn, cast, literal } from 'sequelize';
import commentSchemas from './validation/comments';
import models from '../models';
import { createInstance, destroyInstance, updateInstance } from '../services/data-changes';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { regenerateHighlightsForLocation } from './comment-highlights';
import commentEmail, { replyEmail } from '../services/comment-email';
import { extractCommentContent } from '../utils/helpers';

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({
  region: 'us-east-1',
});

const getAllUsers = async (userPoolId) => {
  let users = [];
  let paginationToken;

  do {
    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      PaginationToken: paginationToken,
      Limit: 60, // Maximum allowed per request
    });

    const response = await client.send(command);
    users = users.concat(response.Users);
    paginationToken = response.PaginationToken;
  } while (paginationToken);

  return users;
};

function getClientIp(req) {
  const forwardedIp = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0]
    : null;

  const ip = forwardedIp || req.ip || req.connection.remoteAddress;

  // Remove IPv6 prefix (if present)
  return ip.replace(/^::ffff:/, '');
}

export default {
  get: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.get, { allowUnknown: true });

      const { locationId } = req.query;
      const ipAddress = getClientIp(req);

      const publicAttributes = [
        'id', 'content', 'created_at', 'hidden', 'contact_info', 'report_count', 'exclude',
        [cast(fn('COUNT', col('likes.id')), 'integer'), 'likes_count'],
        [
          literal(`
            EXISTS (
              SELECT 1
              FROM comment_likes cl
              WHERE cl.comment_id = "Comment"."id"
              AND cl.ip_address = '${ipAddress}'
            )
        `),
          'likedByCurrentUser',
        ],
      ];

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
      const extractedContent = extractCommentContent(postedComment.content);

      getAllUsers('us-east-1_EvBbozIjd')
        .then((users) => {
          const matchedUsers = users.filter(user =>
            user.Attributes.some(attr =>
              attr.Name === 'custom:orgs' &&
              attr.Value.split(',').includes(location.Organization.id)));

          const emails = matchedUsers.map((user) => {
            const email = user.Attributes.find(attr => attr.Name === 'email').Value;
            return email;
          });
          if (emails.length !== 0) {
            commentEmail({
              locationName: location.Organization.name,
              servicesUsed: extractedContent.whatServicesDidYouUse,
              whatCouldBeImproved: extractedContent.whatCouldBeImproved,
              whatWentWell: extractedContent.whatWentWell,
              providersEmail: emails.join(','),
              locationSlug: location.slug,
            }).catch(err => console.error('Error sending comment email:', err.message));
          }
        })
        .catch((err) => {
          console.error('Error listing users:', err);
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

      const location = await models.Location.findByPk(originalComment.location_id, { include: models.Organization });

      const contactEmail = originalComment.contact_info && originalComment.contact_info.trim();
      const isValidEmail = contactEmail && /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/.test(contactEmail);
      if (isValidEmail && location) {
        replyEmail({
          locationName: location.Organization ? location.Organization.name : '',
          toEmail: contactEmail,
          locationSlug: location.slug,
          replyContent: content,
        }).catch(err => console.error('Error sending reply email:', err.message));
      }

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
  excludeFromHighlights: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.setExclude, { allowUnknown: true });

      const { commentId } = req.params;
      const { exclude } = req.body;

      const comment = await models.Comment.findByPk(commentId, { include: models.Location });
      if (!comment) {
        throw new NotFoundError('Comment not found');
      }
      //
      if (!(process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && !req.userIsAdmin) {
        throw new ForbiddenError('Not authorized to hide comments');
      }

      await updateInstance(req.user, comment, { exclude });

      res.sendStatus(204);

      process.nextTick(async () => {
        try {
          console.log('Regenerating highlights...');
          await regenerateHighlightsForLocation(comment.location_id);
          console.log('Highlight regerated successfully');
        } catch (error) {
          console.log(error);
        }
      });

    } catch (err) {
      next(err);
    }
  },

  report: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.report, { allowUnknown: true });

      const { commentId } = req.params;

      const comment = await models.Comment.findByPk(commentId);

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      await updateInstance(req.user, comment, { report_count: comment.report_count + 1 });

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  unReport: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.report, { allowUnknown: true });

      const { commentId } = req.params;

      const comment = await models.Comment.findByPk(commentId);

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      if (comment.report_count <= 0) {
        throw Error('Cannot be unreported because report count already 0');
      }

      await updateInstance(req.user, comment, { report_count: comment.report_count - 1 });

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },

  like: async (req, res, next) => {
    try {
      await Joi.validate(req, commentSchemas.like, { allowUnknown: true });

      const { commentId } = req.params;

      const ip = getClientIp(req);

      if (req.method === 'PUT') {
        const existingLike = await models.CommentLike.findOne({
          where: {
            comment_id: commentId,
            ip_address: ip,
          },
        });

        if (existingLike) {
          throw res.status(409)
            .json({ message: 'Already liked' });
        }

        await models.CommentLike.create({
          comment_id: commentId,
          ip_address: ip,
        });
        res.status(201)
          .json({ message: 'Like added successfully' });
      } else if (req.method === 'DELETE') {
        const deletedLike = await models.CommentLike.destroy({
          where: {
            comment_id: commentId,
            ip_address: ip,
          },
        });

        if (deletedLike) {
          res.status(200)
            .json({ message: 'Like removed successfully' });
        }
        throw res.status(404)
          .json({ message: 'Like not found' });
      }
    } catch (err) {
      next(err);
    }
  },
};

