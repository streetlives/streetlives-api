import Joi from 'joi';

export default {
  create: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string(),
      url: Joi.string(),
      taxonomyId: Joi.string().guid().required(),
      locationId: Joi.string().guid().required(),
    }).required(),
  },

  update: {
    params: Joi.object().keys({
      serviceId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      url: Joi.string(),
      taxonomyId: Joi.string().guid(),
    }).required(),
  },
};
