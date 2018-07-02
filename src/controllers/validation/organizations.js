import Joi from 'joi';

export default {
  find: {
    query: Joi.object().keys({
      searchString: Joi.string().allow(''),
    }),
  },

  create: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string(),
      url: Joi.string(),
    }).required(),
  },

  update: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      url: Joi.string(),
    }).required(),
  },

  getLocations: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
  },
};
