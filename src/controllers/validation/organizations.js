import Joi from 'joi';

const updateMetadataSchema = Joi.object().keys({
  source: Joi.string(),
  lastUpdated: Joi.date().iso(),
  copyedit: Joi.boolean(),
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
      description: Joi.string().allow(''),
      url: Joi.string().allow(''),
      metadata: updateMetadataSchema,
    }).required(),
  },

  getLocations: {
    params: Joi.object().keys({
      organizationId: Joi.string().guid().required(),
    }).required(),
  },
};
