import Joi from 'joi';

const updateMetadataSchema = Joi.object().keys({
  source: Joi.string(),
  lastUpdated: Joi.date().iso(),
});

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
      email: Joi.string().allow('', null),
      url: Joi.string(),
      metadata: updateMetadataSchema,
    }).required(),
  },

  update: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      email: Joi.string().allow('', null),
      url: Joi.string().allow(''),
      metadata: updateMetadataSchema,
    }).required(),
  },

  get: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
  },

  getLocations: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
  },
};
