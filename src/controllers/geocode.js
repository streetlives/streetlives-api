import Joi from 'joi';

import models from '../models';
import geocodeSchemas from './validation/geocode';

export default {
  findAnalytics: async (req, res, next) => {
    try {
      await Joi.validate(req, geocodeSchemas.findAnalytics, { allowUnknown: true });

      const {
        latitude: latitudeString,
        longitude: longitudeString,
      } = req.query;

      const latitude = parseFloat(latitudeString, 10);
      const longitude = parseFloat(longitudeString, 10);

      const neighborhood =
        await models.NycNeighborhoodGeometries.findByLatLong(latitude, longitude);

      const districts =
        await models.NycDistricts.findByLatLong(latitude, longitude);

      res.setHeader('Content-Type', 'application/json');
      res.send({
        neighborhood: neighborhood && neighborhood.neighborhood,
        borough: neighborhood && neighborhood.borough,
        districts,
      });
    } catch (err) {
      next(err);
    }
  },
};
