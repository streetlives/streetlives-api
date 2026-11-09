import Joi from 'joi';
import schemas from './validation/location-changes';
import { getLocationChanges, getLocationEdits } from '../services/location-changes';

const respond = (schema, read) => async (req, res, next) => {
  try {
    await Joi.validate(req, schema, { allowUnknown: true });
    const page = await read(req.query);
    res.set('Cache-Control', 'no-store');
    res.send(page);
  } catch (err) {
    next(err);
  }
};

export default {
  getChanges: respond(schemas.getChanges, getLocationChanges),
  getEdits: respond(schemas.getEdits, getLocationEdits),
};
