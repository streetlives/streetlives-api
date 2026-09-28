import Joi from 'joi';
import { SORT_OPTIONS, SORT_ORDER } from '../sort-by';

const updateMetadataSchema = Joi.object().keys({
  source: Joi.string(),
  lastUpdated: Joi.date().iso(),
});

// Lambda's synchronous invoke payload limit is 6MB, and that binds well before
// API Gateway's 10MB request cap - the event JSON carries the body plus the
// headers. Base64 inflates by 4/3, so 4MiB decoded leaves comfortable room.
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_MAX_BASE64_CHARS = (Math.ceil(PHOTO_MAX_BYTES / 3) * 4) + 4;
const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      // Populating naturalLanguageQuery implies the caller has shown the user
      // the third-party-AI notice (the text is sent to OpenAI) — see PRIVACY.md.
      naturalLanguageQuery: Joi.string().max(500),
      organizationName: Joi.string().min(3),
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
      streetview: Joi.object().keys({
        pano_id: Joi.string().max(128).allow(null),
        lat: Joi.number().min(-90).max(90).allow(null),
        lng: Joi.number().min(-180).max(180).allow(null),
        heading: Joi.number().min(0).max(360).allow(null),
        pitch: Joi.number().min(-90).max(90).allow(null),
        fov: Joi.number().integer().min(10).max(120)
          .allow(null),
        // {} would otherwise create an all-null streetview row; require at
        // least one field (null still means delete, omission means unchanged).
        // unknown(false) opts out of the API-wide allowUnknown here: unknown
        // keys would satisfy min(1) while being ignored by the controller,
        // so {bogus: 'x'} would also create an all-null row.
      }).min(1).allow(null)
        .unknown(false),
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

  setPhoto: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
    body: Joi.object().keys({
      contentType: Joi.string().valid(PHOTO_CONTENT_TYPES).required(),
      // .max() deliberately precedes .base64(): joi runs tests in chain order,
      // and regexing several megabytes of garbage before checking the length
      // is wasted work on every oversized request.
      data: Joi.string().required().max(PHOTO_MAX_BASE64_CHARS)
        .base64({ paddingRequired: true }),
      filename: Joi.string().max(255),
      metadata: updateMetadataSchema,
      // No .unknown(false) here, unlike the streetview sub-schema. That flag
      // exists there because .min(1) could be satisfied by a key the
      // controller ignores, creating an all-null row. This schema has required
      // fields and no such hazard, and dataEntryAuth() takes no body fields, so
      // no unknown key can contribute authorization scope either.
    }).required(),
  },

  deletePhoto: {
    params: Joi.object().keys({
      locationId: Joi.string().guid().required(),
    }).required(),
  },
};
