import Joi from 'joi';

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const hourRegex = /^\d{2}:\d{2}$/;

const updateMetadataSchema = Joi.object().keys({
  source: Joi.string(),
  lastUpdated: Joi.date().iso(),
});

export default {
  create: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string(),
      url: Joi.string(),
      additionalInfo: Joi.string(),
      taxonomyId: Joi.string().guid().required(),
      locationId: Joi.string().guid().required(),
      metadata: updateMetadataSchema,
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
        weekday: Joi.string().valid(weekdays).required(),
        opensAt: Joi.string().regex(hourRegex, { name: 'HH:MM' }).allow(null),
        closesAt: Joi.string().regex(hourRegex, { name: 'HH:MM' }).allow(null),
      })),
      irregularHours: Joi.array().items(Joi.object().keys({
        opensAt: Joi.string().regex(hourRegex, { name: 'HH:MM' }).allow(null)
          .when('closed', {
            is: false,
            then: Joi.string().regex(hourRegex, { name: 'HH:MM' }).required(),
          }),
        closesAt: Joi.string().regex(hourRegex, { name: 'HH:MM' }).allow(null),
        weekday: Joi.string().valid(weekdays),
        closed: Joi.boolean().required(),
        startDate: Joi.date(),
        endDate: Joi.date(),
        occasion: Joi.string(),
      })
        .or('occasion', 'startDate')
        .and('startDate', 'endDate')
        .and('opensAt', 'closesAt')),
      languageIds: Joi.array().items(Joi.string().guid().required()),
      documents: Joi.object().keys({
        proofs: Joi.array().items(Joi.string()),
        recertificationTime: Joi.string(),
        gracePeriod: Joi.string(),
        additionalInfo: Joi.string(),
      }),
      eventRelatedInfo: Joi.object().keys({
        event: Joi.string().required(),
        information: Joi.string().required().allow(null),
      }),
      agesServed: Joi.any(),
      whoDoesItServe: Joi.any(),
      metadata: updateMetadataSchema,
    }).required(),
  },

  delete: {
    params: Joi.object().keys({
      serviceId: Joi.string().guid().required(),
    }).required(),
  },
};
