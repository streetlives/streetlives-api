import models from '../models';

export default {
  getAll: async (req, res, next) => {
    try {
      const languages = await models.Language.findAll();
      res.send(languages);
    } catch (err) {
      next(err);
    }
  },
};
