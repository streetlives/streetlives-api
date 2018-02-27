import Joi from 'joi';

export default {
  find: {
    query: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      radius: Joi.number().max(50000).required(),
      searchString: Joi.string().allow(''),
      taxonomyId: Joi.string().guid(),
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

  getInfo: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
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
};
