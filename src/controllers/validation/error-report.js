import Joi from 'joi';

export default {
  get: {
    query: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
  },

  create: {
    body: Joi.object().keys({
      locationId: Joi.string().guid().required(),
      general: Joi.boolean(),
      services: Joi.array().items(Joi.string().guid()),
      content: Joi.string(),
    }).required(),
  },

  delete: {
    params: Joi.object().keys({
      errorReportId: Joi.string().guid().required(),
    }).required(),
  },
};
