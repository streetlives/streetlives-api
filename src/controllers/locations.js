import models from '../models';
import geometry from '../utils/geometry';
import { NotFoundError } from '../utils/errors';

export default {
  find: (req, res, next) => {
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

    models.Location.findAllInArea(position, radius, filterParameters)
      .then((locations) => {
        res.send(locations);
      })
      .catch(next);
  },

  suggestNew: (req, res, next) => {
    const {
      name,
      latitude,
      longitude,
      taxonomyIds,
    } = req.body;

    models.LocationSuggestion.create({
      name,
      position: geometry.createPoint(longitude, latitude),
      taxonomy_ids: taxonomyIds,
    })
      .then(() => {
        res.sendStatus(201);
      })
      .catch(next);
  },

  getInfo: (req, res, next) => {
    models.Location.findById(
      req.params.locationId,
      { include: [models.Service, models.Comment] },
    )
      .then((location) => {
        res.send(location);
      })
      .catch(next);
  },

  rate: (req, res) => {
    res.sendStatus(201);
  },

  addComment: (req, res, next) => {
    const { locationId } = req.params;
    const { content, postedBy } = req.body;

    models.Location.findById(locationId)
      .then((location) => {
        if (!location) {
          throw new NotFoundError('Location not found');
        }

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
