import { Op } from 'sequelize';

import models from '../models';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import {
  executeResourceAction,
  normalizeResource,
  SUPPORTED_PATCH_RESOURCES,
  SUPPORTED_DELETE_RESOURCES,
} from './resource-actions';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const DEFAULT_RUN_LIMIT = 25;

const { statuses, methods } = models.ScheduledAction;

const isPlainObject = value =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getDate = (value, fieldName) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }
  return date;
};

const assertSupportedResource = (method, resource) => {
  const supportedResources = method === methods.patch
    ? SUPPORTED_PATCH_RESOURCES
    : SUPPORTED_DELETE_RESOURCES;

  if (!supportedResources.includes(resource)) {
    throw new ValidationError(`${method} is not supported for scheduled ${resource} actions`);
  }
};

const normalizeMethod = (method) => {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  if (!Object.values(methods).includes(normalizedMethod)) {
    throw new ValidationError(`Unsupported scheduled action method: ${method}`);
  }
  return normalizedMethod;
};

export const serializeScheduledAction = (scheduledActionInstance) => {
  const action = scheduledActionInstance.get
    ? scheduledActionInstance.get({ plain: true })
    : scheduledActionInstance;
  const runAt = action.run_at ? new Date(action.run_at) : null;
  const lockedAt = action.locked_at ? new Date(action.locked_at) : null;
  const lockExpiresAt = lockedAt ? new Date(lockedAt.getTime() + LOCK_TIMEOUT_MS) : null;

  return {
    id: action.id,
    method: action.method,
    resource: action.resource,
    resourceId: action.resource_id,
    payload: action.payload,
    status: action.status,
    runAt,
    runAtMs: runAt ? runAt.getTime() : null,
    requestedBy: action.requested_by,
    label: action.label,
    note: action.note,
    changedFields: action.changed_fields || [],
    metadata: action.metadata,
    attempts: action.attempts,
    maxAttempts: action.max_attempts,
    lastError: action.last_error,
    lastErrorAt: action.last_error_at,
    lockedAt,
    lockedBy: action.locked_by,
    lockExpiresAt,
    runningAt: lockedAt ? lockedAt.getTime() : null,
    completedAt: action.completed_at,
    cancelledAt: action.cancelled_at,
    result: action.result,
    createdAt: action.created_at,
    updatedAt: action.updated_at,
  };
};

export const createScheduledAction = async ({ method, body, user }) => {
  const normalizedMethod = normalizeMethod(method);
  const resource = normalizeResource(body.resource);
  assertSupportedResource(normalizedMethod, resource);

  const runAt = getDate(body.runAt, 'runAt');
  const tooFarInPast = runAt.getTime() < Date.now() - 30000;
  if (tooFarInPast) {
    throw new ValidationError('runAt cannot be in the past');
  }

  if (normalizedMethod === methods.patch && !isPlainObject(body.payload)) {
    throw new ValidationError('payload is required for scheduled PATCH actions');
  }

  const scheduledAction = await models.ScheduledAction.create({
    method: normalizedMethod,
    resource,
    resource_id: body.resourceId,
    payload: normalizedMethod === methods.patch ? body.payload : null,
    status: statuses.scheduled,
    run_at: runAt,
    requested_by: user,
    label: body.label,
    note: body.note,
    changed_fields: body.changedFields || [],
    metadata: body.metadata,
    max_attempts: body.maxAttempts || 3,
  });

  return scheduledAction;
};

export const listScheduledActions = (filters = {}) => {
  const where = {};

  if (filters.statuses && filters.statuses.length) {
    where.status = { [Op.in]: filters.statuses };
  }
  if (filters.resource) {
    where.resource = normalizeResource(filters.resource);
  }
  if (filters.resourceId) {
    where.resource_id = filters.resourceId;
  }
  if (filters.method) {
    where.method = normalizeMethod(filters.method);
  }
  if (filters.requestedBy) {
    where.requested_by = filters.requestedBy;
  }

  return models.ScheduledAction.findAll({
    where,
    order: [['run_at', 'ASC'], ['created_at', 'ASC']],
    limit: filters.limit || 100,
  });
};

export const cancelScheduledAction = async (scheduledActionId, user, options = {}) => {
  const scheduledAction = await models.ScheduledAction.findByPk(scheduledActionId);
  if (!scheduledAction) {
    throw new NotFoundError('Scheduled action not found');
  }

  if (!options.isAdmin && scheduledAction.requested_by !== user) {
    throw new ForbiddenError('Cannot cancel another user\'s scheduled action');
  }

  if ([statuses.completed, statuses.cancelled].includes(scheduledAction.status)) {
    throw new ValidationError(`Cannot cancel a ${scheduledAction.status} scheduled action`);
  }

  if (scheduledAction.status === statuses.running) {
    throw new ValidationError('Cannot cancel a scheduled action while it is running');
  }

  await scheduledAction.update({
    status: statuses.cancelled,
    cancelled_at: new Date(),
    locked_at: null,
    locked_by: null,
    result: {
      cancelledBy: user,
    },
  });

  return scheduledAction;
};

const isNonRetryableError = err =>
  err instanceof NotFoundError || err instanceof ValidationError;

const claimScheduledAction = (scheduledActionId, now, triggeredBy) =>
  models.sequelize.transaction(async (transaction) => {
    const scheduledAction = await models.ScheduledAction.findByPk(scheduledActionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!scheduledAction) {
      return null;
    }

    const lockedAt = scheduledAction.locked_at
      ? new Date(scheduledAction.locked_at).getTime()
      : 0;
    const staleRunningLock = scheduledAction.status === statuses.running
      && (!lockedAt || lockedAt <= now.getTime() - LOCK_TIMEOUT_MS);
    const dueScheduledAction = scheduledAction.status === statuses.scheduled
      && new Date(scheduledAction.run_at).getTime() <= now.getTime();

    if (!dueScheduledAction && !staleRunningLock) {
      return null;
    }

    await scheduledAction.update({
      status: statuses.running,
      attempts: scheduledAction.attempts + 1,
      locked_at: now,
      locked_by: triggeredBy,
      last_error: null,
      last_error_at: null,
    }, { transaction });

    return scheduledAction;
  });

const completeScheduledAction = scheduledAction => scheduledAction.update({
  status: statuses.completed,
  completed_at: new Date(),
  locked_at: null,
  locked_by: null,
  result: {
    ok: true,
  },
});

const failScheduledAction = (scheduledAction, err) => {
  const now = new Date();
  const retryable = !isNonRetryableError(err)
    && scheduledAction.attempts < scheduledAction.max_attempts;

  return scheduledAction.update({
    status: retryable ? statuses.scheduled : statuses.failed,
    run_at: retryable ? new Date(Date.now() + RETRY_DELAY_MS) : scheduledAction.run_at,
    locked_at: null,
    locked_by: null,
    last_error: err.stack || err.message || String(err),
    last_error_at: now,
    result: {
      ok: false,
      retryable,
    },
  });
};

const runScheduledAction = async (scheduledAction, now, triggeredBy) => {
  const claimedAction = await claimScheduledAction(scheduledAction.id, now, triggeredBy);

  if (!claimedAction) {
    return {
      id: scheduledAction.id,
      status: 'skipped',
    };
  }

  try {
    await executeResourceAction({
      method: claimedAction.method,
      resource: claimedAction.resource,
      resourceId: claimedAction.resource_id,
      payload: claimedAction.payload,
      user: claimedAction.requested_by,
    });

    await completeScheduledAction(claimedAction);
    return {
      id: claimedAction.id,
      status: statuses.completed,
    };
  } catch (err) {
    await failScheduledAction(claimedAction, err);
    return {
      id: claimedAction.id,
      status: claimedAction.status,
      error: err.message,
    };
  }
};

export const runDueScheduledActions = async ({
  now = new Date(),
  limit = DEFAULT_RUN_LIMIT,
  triggeredBy = 'scheduled-actions-runner',
} = {}) => {
  const staleLockCutoff = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const dueActions = await models.ScheduledAction.findAll({
    where: {
      run_at: { [Op.lte]: now },
      [Op.or]: [
        { status: statuses.scheduled },
        {
          status: statuses.running,
          locked_at: { [Op.lte]: staleLockCutoff },
        },
      ],
    },
    order: [['run_at', 'ASC'], ['created_at', 'ASC']],
    limit,
  });

  const results = [];
  for (const scheduledAction of dueActions) {
    results.push(await runScheduledAction(scheduledAction, now, triggeredBy));
  }

  return {
    processed: results.length,
    results,
  };
};

export default {
  createScheduledAction,
  listScheduledActions,
  cancelScheduledAction,
  runDueScheduledActions,
  serializeScheduledAction,
};
