import Joi from 'joi';

export default {
  create: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string(),
      url: Joi.string(),
      additionalInfo: Joi.string(),
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
      additionalInfo: Joi.string(),
      taxonomyId: Joi.string().guid(),
      hours: Joi.array().items(Joi.object().keys({
        weekday: Joi.string().valid([
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ]).required(),
        opensAt: Joi.string().regex(/^\d{2}:\d{2}$/, { name: 'HH:MM' }),
        closesAt: Joi.string().regex(/^\d{2}:\d{2}$/, { name: 'HH:MM' }),
      })),
      languageIds: Joi.array().items(Joi.string().guid().required()),
      agesServed: Joi.any(),
      whoDoesItServe: Joi.any(),
    }).required(),
  },
};
