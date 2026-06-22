import Joi from 'joi';
import { SORT_OPTIONS, SORT_ORDER } from '../sort-by';

const updateMetadataSchema = Joi.object().keys({
  source: Joi.string(),
  lastUpdated: Joi.date().iso(),
});

export default {
  find: {
    query: Joi.object().keys({
      latitude: Joi.number().when('sortBy', {
        is: SORT_ORDER.NEARBY,
        then: Joi.required(),
      }),
      longitude: Joi.number().when('sortBy', {
        is: SORT_ORDER.NEARBY,
        then: Joi.required(),
      }),
      radius: Joi.number()
        .integer().positive().max(50000),
      minResults: Joi.number()
        .integer().positive().max(500),
      maxResults: Joi.number()
        .integer().positive()
        .min(Joi.ref('minResults', { default: 0 }))
        .max(1000),
      searchString: Joi.string().allow(''),
      organizationName: Joi.string().min(3),
      noServices: Joi.boolean(),
      zipcodes: Joi.array().max(200).items(Joi.string().length(5).regex(/\d+/)),
      taxonomyId: Joi.string(),
      openAt: Joi.date().iso(),
      occasion: Joi.string(),
      referralRequired: Joi.boolean(),
      photoIdRequired: Joi.boolean(),
      membership: Joi.boolean(),
      gender: Joi.string(),
      servesZipcode: Joi.string().length(5).regex(/\d+/),
      taxonomySpecificAttributes: Joi.array().max(200).items(Joi.string()),
      pageNumber: Joi.number(),
      pageSize: Joi.number(),
      age: Joi.number(),
      ageMin: Joi.number(),
      ageMax: Joi.number(),
      sortBy: Joi.string().valid(SORT_OPTIONS),
    })
      .with('radius', ['latitude', 'longitude'])
      .required(),
  },

  getInfo: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
  },

  getInfoBySlug: {
    params: Joi.object().keys({
      slug: Joi.string().required(),
    }).required(),
  },

  create: {
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      organizationId: Joi.string().guid().required(),
      additionalInfo: Joi.string(),
      address: Joi.object().keys({
        street: Joi.string().required(),
        city: Joi.string().required(),
        region: Joi.string(),
        state: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().required(),
      }).required(),
      metadata: updateMetadataSchema,
    }).required(),
  },

  update: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      name: Joi.string().allow(''),
      description: Joi.string(),
      latitude: Joi.number(),
      longitude: Joi.number(),
      organizationId: Joi.string().guid(),
      additionalInfo: Joi.string(),
      address: Joi.object().keys({
        street: Joi.string(),
        city: Joi.string(),
        region: Joi.string(),
        state: Joi.string(),
        postalCode: Joi.string(),
        country: Joi.string(),
      }),
      eventRelatedInfo: Joi.object().keys({
        event: Joi.string().required(),
        information: Joi.string().required().allow(null),
      }),
      metadata: updateMetadataSchema,
    }).required(),
  },

  addPhone: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      number: Joi.string().required(),
      extension: Joi.number().allow(null),
      type: Joi.string(),
      language: Joi.string(),
      description: Joi.string(),
      metadata: updateMetadataSchema,
    }).required(),
  },

  updatePhone: {
    params: Joi.object().keys({
      phoneId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      number: Joi.string(),
      extension: Joi.number().allow(null),
      type: Joi.string(),
      language: Joi.string(),
      description: Joi.string(),
      metadata: updateMetadataSchema,
    }),
  },

  deletePhone: {
    params: Joi.object().keys({
      phoneId: Joi.string().guid().required(),
    }).required(),
  },

  updateStreetview: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      streetview_url: Joi.string(),
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
};
