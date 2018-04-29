import models from '../models';

export default {
  getAll: async (req, res, next) => {
    try {
      const taxonomy = await models.Taxonomy.getHierarchy();
      res.send(taxonomy);
    } catch (err) {
      next(err);
    }
  },
};
