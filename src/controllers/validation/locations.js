import Joi from 'joi';

export default {
  find: {
    query: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      radius: Joi.number()
        .integer().positive().max(50000)
        .required(),
      searchString: Joi.string().allow(''),
      taxonomyId: Joi.string().guid(),
    }).required(),
  },

  getInfo: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
  },

  create: {
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      organizationId: Joi.string().guid().required(),
      address: Joi.object().keys({
        street: Joi.string().required(),
        city: Joi.string().required(),
        region: Joi.string(),
        state: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().required(),
      }).required(),
    }).required(),
  },

  update: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      latitude: Joi.number(),
      longitude: Joi.number(),
      organizationId: Joi.string().guid(),
      address: Joi.object().keys({
        street: Joi.string(),
        city: Joi.string(),
        region: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string(),
      }),
    }).required(),
  },

  addPhone: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      number: Joi.string().required(),
      extension: Joi.number(),
      type: Joi.string(),
      language: Joi.string(),
      description: Joi.string(),
    }).required(),
  },

  updatePhone: {
    params: Joi.object().keys({
      phoneId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      number: Joi.string(),
      extension: Joi.number(),
      type: Joi.string(),
      language: Joi.string(),
      description: Joi.string(),
    }),
  },

  deletePhone: {
    params: Joi.object().keys({
      phoneId: Joi.string().guid().required(),
    }).required(),
  },

  addComment: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      content: Joi.string().required(),
      postedBy: Joi.string().required(),
    }).required(),
  },

  suggestNew: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      taxonomyIds: Joi.string().allow(''),
    }).required(),
  },
};
