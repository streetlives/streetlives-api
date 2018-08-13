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
};
