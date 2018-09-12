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
      content: Joi.string().required(),
      postedBy: Joi.string(),
      contactInfo: Joi.string(),
    }).required(),
  },

  reply: {
    params: Joi.object().keys({
      commentId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      content: Joi.string().required(),
      postedBy: Joi.string(),
      contactInfo: Joi.string(),
    }).required(),
  },

  delete: {
    params: Joi.object().keys({
      commentId: Joi.string().guid().required(),
    }).required(),
  },
};
