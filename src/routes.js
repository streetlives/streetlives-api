import locations from './controllers/locations';
import { BadRequestError, NotFoundError } from './utils/errors';

export default (app) => {
  app.get('/locations', locations.find);
  app.post('/locations', locations.suggestNew);

  app.get('/locations/:id', locations.getInfo);
  app.post('/locations/:id/rating', locations.rate);
  app.post('/locations/:id/comment', locations.addComment);

  app.use((req, res) => res.status(404).send({
    url: req.originalUrl,
    error: 'Not found',
  }));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof BadRequestError) {
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
