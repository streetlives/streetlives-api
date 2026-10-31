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
const bymonthRegex = /^([1-9]|1[0-2])(,([1-9]|1[0-2]))*$/;
// Numbered BYDAY and BYMONTHDAY need a month to count in (RFC 5545). Required, or a missing
// freq would match too.
const withinMonth = Joi.valid('MONTHLY', 'YEARLY').required();

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
        freq: Joi.string().valid(['WEEKLY', 'MONTHLY', 'YEARLY']).allow(null),
        interval: Joi.number().integer().min(1).allow(null),
        byday: Joi.string().allow(null).when('freq', {
          is: withinMonth,
          then: Joi.string().regex(bydayRegex, { name: 'BYDAY' }),
          otherwise: Joi.string().regex(weeklyBydayRegex, { name: 'weekly BYDAY' }),
        }),
        bymonthday: Joi.string().allow(null).when('freq', {
          is: withinMonth,
          then: Joi.string().regex(bymonthdayRegex, { name: 'BYMONTHDAY' }),
          otherwise: Joi.valid(null),
        }),
        // The months a rule applies in; a yearly row has to name them.
        bymonth: Joi.when('freq', {
          is: 'YEARLY',
          then: Joi.string().regex(bymonthRegex, { name: 'BYMONTH' }).required(),
          otherwise: Joi.when('freq', {
            is: Joi.string().required(),
            then: Joi.string().regex(bymonthRegex, { name: 'BYMONTH' }).allow(null),
            otherwise: Joi.valid(null),
          }),
        }),
        // The first occurrence; "every 2 weeks" counts from it.
        validFrom: Joi.date().allow(null).when('interval', {
          is: Joi.number().greater(1).required(),
          then: Joi.date().required(),
        }),
        // A series can stop on a date without saying when it started.
        validTo: Joi.date().allow(null).when('validFrom', {
          is: Joi.date().required(),
          then: Joi.date().min(Joi.ref('validFrom')).allow(null),
        }),
        description: Joi.string().allow('', null),
        // Dates a repeating row skips.
        exdates: Joi.array().items(Joi.date()).allow(null).when('freq', {
          is: Joi.string().required(),
          otherwise: Joi.array().max(0).allow(null),
        }),
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
