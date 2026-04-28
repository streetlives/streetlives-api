import Joi from 'joi';

const uuid = Joi.string().guid();
const statusValues = '(scheduled|running|completed|failed|cancelled)';
const statusPattern = new RegExp(`^${statusValues}(,${statusValues})*$`);
const statusQuery = Joi.string().regex(statusPattern);

const scheduleBase = {
  resource: Joi.string().required(),
  resourceId: uuid.required(),
  runAt: Joi.date().iso().required(),
  label: Joi.string().allow(''),
  note: Joi.string().allow(''),
  changedFields: Joi.array().items(Joi.string()),
  metadata: Joi.object().unknown(true),
  maxAttempts: Joi.number().integer().min(1).max(10),
};

export default {
  createPatch: {
    body: Joi.object().keys({
      ...scheduleBase,
      payload: Joi.object().unknown(true).min(1).required(),
    }).required(),
  },

  createDeletion: {
    body: Joi.object().keys(scheduleBase).required(),
  },

  list: {
    query: Joi.object().keys({
      status: statusQuery,
      statuses: statusQuery,
      resource: Joi.string(),
      resourceId: uuid,
      method: Joi.string().valid(['PATCH', 'DELETE', 'patch', 'delete']),
      limit: Joi.number().integer().min(1).max(500),
    }),
  },

  cancel: {
    params: Joi.object().keys({
      scheduledActionId: uuid.required(),
    }).required(),
  },

  runDue: {
    body: Joi.object().keys({
      limit: Joi.number().integer().min(1).max(50),
    }),
  },
};
