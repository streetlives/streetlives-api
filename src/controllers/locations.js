import models from '../models';
import geometry from '../utils/geometry';

export default {
  find: (req, res) => {
    res.sendStatus(200);
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

  getInfo: (req, res) => {
    res.sendStatus(200);
  },

  rate: (req, res) => {
    res.sendStatus(201);
  },

  addComment: (req, res) => {
    res.sendStatus(201);
  },
};
