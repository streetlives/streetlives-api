import Joi from 'joi';

export default {
  findAnalytics: {
    query: Joi.object().keys({
      latitude: Joi.number(),
      longitude: Joi.number(),
    })
      .and('latitude', 'longitude')
      .required(),
  },
};
