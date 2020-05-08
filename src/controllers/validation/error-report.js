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
      generalLocationError: Joi.boolean().required(),
      services: Joi.array().items(Joi.string().guid()).required(),
      content: Joi.string().empty(''),
    }).required(),
  },

  delete: {
    params: Joi.object().keys({
      errorReportId: Joi.string().guid().required(),
    }).required(),
  },
};
