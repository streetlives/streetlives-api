import locations from './controllers/locations';
import { NotFoundError } from './utils/errors';

export default (app) => {
  app.get('/locations', locations.find);
  app.post('/locations/suggestions', locations.suggestNew);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations/:locationId/comments', locations.addComment);

  app.get('/load', locations.loadData);

  app.use((req, res) => res.status(404).send({
    url: req.originalUrl,
    error: 'Not found',
  }));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err.name === 'ValidationError') {
      return res.status(400).send({ error: err.stack });
    }

    if (err instanceof NotFoundError) {
      return res.status(404).send({
        url: req.originalUrl,
        error: err.message,
      });
    }

    return res.status(500).send({ error: err.stack });
  });
};
