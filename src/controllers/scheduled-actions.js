import Joi from 'joi';

import scheduledActionSchemas from './validation/scheduled-actions';
import {
  createScheduledAction,
  listScheduledActions,
  cancelScheduledAction,
  runDueScheduledActions,
  serializeScheduledAction,
} from '../services/scheduled-actions';
import { ForbiddenError } from '../utils/errors';

const parseStatuses = req => (
  req.query.statuses || req.query.status || ''
)
  .split(',')
  .map(status => status.trim())
  .filter(Boolean);

const requireAdminRunAccess = (req) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return;
  }

  if (!req.userIsAdmin) {
    throw new ForbiddenError('Only admins can run due scheduled actions manually');
  }
};

const rejectNestedMetadataForNonAdmins = (req) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return;
  }

  if (req.body.payload && req.body.payload.metadata && !req.userIsAdmin) {
    throw new ForbiddenError('Only admins are allowed to specify custom metadata for data changes');
  }
};

const isAdminRequest = req => (
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  req.userIsAdmin
);

export default {
  createPatch: async (req, res, next) => {
    try {
      await Joi.validate(req, scheduledActionSchemas.createPatch, { allowUnknown: true });
      rejectNestedMetadataForNonAdmins(req);

      const scheduledAction = await createScheduledAction({
        method: 'PATCH',
        body: req.body,
        user: req.user,
      });

      res.status(201).send({
        scheduledAction: serializeScheduledAction(scheduledAction),
      });
    } catch (err) {
      next(err);
    }
  },

  createDeletion: async (req, res, next) => {
    try {
      await Joi.validate(req, scheduledActionSchemas.createDeletion, { allowUnknown: true });

      const scheduledAction = await createScheduledAction({
        method: 'DELETE',
        body: req.body,
        user: req.user,
      });

      res.status(201).send({
        scheduledAction: serializeScheduledAction(scheduledAction),
      });
    } catch (err) {
      next(err);
    }
  },

  list: async (req, res, next) => {
    try {
      await Joi.validate(req, scheduledActionSchemas.list, { allowUnknown: true });

      const scheduledActions = await listScheduledActions({
        statuses: parseStatuses(req),
        resource: req.query.resource,
        resourceId: req.query.resourceId,
        method: req.query.method,
        limit: req.query.limit && parseInt(req.query.limit, 10),
        requestedBy: isAdminRequest(req) ? null : req.user,
      });

      res.send({
        scheduledActions: scheduledActions.map(serializeScheduledAction),
      });
    } catch (err) {
      next(err);
    }
  },

  cancel: async (req, res, next) => {
    try {
      await Joi.validate(req, scheduledActionSchemas.cancel, { allowUnknown: true });

      const scheduledAction = await cancelScheduledAction(
        req.params.scheduledActionId,
        req.user,
        { isAdmin: isAdminRequest(req) },
      );

      res.send({
        scheduledAction: serializeScheduledAction(scheduledAction),
      });
    } catch (err) {
      next(err);
    }
  },

  runDue: async (req, res, next) => {
    try {
      await Joi.validate(req, scheduledActionSchemas.runDue, { allowUnknown: true });
      requireAdminRunAccess(req);

      const result = await runDueScheduledActions({
        limit: req.body.limit,
        triggeredBy: req.user,
      });

      res.send(result);
    } catch (err) {
      next(err);
    }
  },
};
