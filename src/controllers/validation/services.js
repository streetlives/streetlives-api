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
// RFC 5545 BYDAY as used by HSDS 3.0 schedule.byday, e.g. "MO,WE", "2FR", "-1MO". Only the
// last week counts from the end (-1): the front ends have no words for "-2FR" and the like.
const bydayRegex = /^(-1|[1-5])?(MO|TU|WE|TH|FR|SA|SU)(,(-1|[1-5])?(MO|TU|WE|TH|FR|SA|SU))*$/;
// Outside freq MONTHLY, RFC 5545 allows only plain weekdays and no BYMONTHDAY.
const weeklyBydayRegex = /^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/;
const bymonthdayRegex = /^-?([1-9]|[12]\d|3[01])(,-?([1-9]|[12]\d|3[01]))*$/;

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
      description: Joi.string().allow(''),
      url: Joi.string(),
      additionalInfo: Joi.string().allow(''),
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
        freq: Joi.string().valid(['WEEKLY', 'MONTHLY']).allow(null),
        interval: Joi.number().integer().min(1).allow(null),
        byday: Joi.string().allow(null).when('freq', {
          is: 'MONTHLY',
          then: Joi.string().regex(bydayRegex, { name: 'BYDAY' }),
          otherwise: Joi.string().regex(weeklyBydayRegex, { name: 'weekly BYDAY' }),
        }),
        bymonthday: Joi.string().allow(null).when('freq', {
          is: 'MONTHLY',
          then: Joi.string().regex(bymonthdayRegex, { name: 'BYMONTHDAY' }),
          otherwise: Joi.valid(null),
        }),
        validFrom: Joi.date().allow(null),
        validTo: Joi.date().min(Joi.ref('validFrom')).allow(null),
        description: Joi.string().allow('', null),
      })
        .or('occasion', 'startDate', 'validFrom')
        .and('startDate', 'endDate')
        .and('opensAt', 'closesAt')),
      languageIds: Joi.array().items(Joi.string().guid().required()),
      documents: Joi.object().keys({
        proofs: Joi.array().items(Joi.string()),
        recertificationTime: Joi.string().allow(''),
        gracePeriod: Joi.string().allow(''),
        additionalInfo: Joi.string().allow(''),
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
