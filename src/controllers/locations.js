import Joi from 'joi';
import validation from './validation';
import models from '../models';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';

export default {
  find: (req, res, next) => {
    Joi.validate(req, validation.locations.find, { allowUnknown: true })
      .then(() => {
        const {
          latitude,
          longitude,
          radius,
          searchString,
          taxonomyId,
        } = req.query;

        const position = geometry.createPoint(longitude, latitude);

        const filterParameters = {};
        if (searchString) {
          filterParameters.searchString = searchString.trim();
        }
        if (taxonomyId) {
          filterParameters.taxonomyId = taxonomyId.trim();
        }

        return models.Location.findAllInArea(position, radius, filterParameters);
      })
      .then((locations) => {
        res.send(locations);
      })
      .catch(next);
  },

  suggestNew: (req, res, next) => {
    Joi.validate(req, validation.locations.suggestNew, { allowUnknown: true })
      .then(() => {
        const {
          name,
          latitude,
          longitude,
          taxonomyIds,
        } = req.body;

        return models.LocationSuggestion.create({
          name,
          position: geometry.createPoint(longitude, latitude),
          taxonomy_ids: taxonomyIds,
        });
      })
      .then(() => {
        res.sendStatus(201);
      })
      .catch(next);
  },

  getInfo: (req, res, next) => {
    Joi.validate(req, validation.locations.getInfo, { allowUnknown: true })
      .then(() => models.Location.findById(
        req.params.locationId,
        { include: [models.Service, models.Comment] },
      ))
      .then((location) => {
        res.send(location);
      })
      .catch(next);
  },

  rate: (req, res) => {
    res.sendStatus(201);
  },

  addComment: (req, res, next) => {
    Joi.validate(req, validation.locations.addComment, { allowUnknown: true })
      .then(() => models.Location.findById(req.params.locationId))
      .then((location) => {
        if (!location) {
          throw new NotFoundError('Location not found');
        }

        const { content, postedBy } = req.body;

        return location.createComment({
          content,
          posted_by: postedBy,
        });
      })
      .then(() => {
        res.sendStatus(201);
      })
      .catch(next);
  },
};
