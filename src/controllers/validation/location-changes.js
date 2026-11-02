import Joi from 'joi';
import {
  LOCATION_CHANGES_MAX_LIMIT,
  LOCATION_EDITS_MAX_LIMIT,
} from '../../services/location-changes';

const feedQuery = maxLimit => Joi.object().keys({
  since: Joi.date().iso(),
  cursor: Joi.string().max(200),
  limit: Joi.number().integer().min(1).max(maxLimit),
}).or('since', 'cursor').required();

export default {
  getChanges: {
    query: feedQuery(LOCATION_CHANGES_MAX_LIMIT),
  },
  getEdits: {
    query: feedQuery(LOCATION_EDITS_MAX_LIMIT),
  },
};
