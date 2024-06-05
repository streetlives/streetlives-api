import Joi from 'joi';

export default {
  findAnalytics: {
    query: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
    }),
  },
};
