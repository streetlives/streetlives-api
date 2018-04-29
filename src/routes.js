import locations from './controllers/locations';
import services from './controllers/services';
import organizations from './controllers/organizations';
import taxonomy from './controllers/taxonomy';
import { NotFoundError } from './utils/errors';

export default (app) => {
  app.get('/locations', locations.find);

  app.post('/locations/suggestions', locations.suggestNew);
  app.post('/locations/:locationId/comments', locations.addComment);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations', locations.create);
  app.patch('/locations/:locationId', locations.update);

  app.post('/locations/:locationId/phones', locations.addPhone);
  app.patch('/phones/:phoneId', locations.updatePhone);
  app.delete('/phones/:phoneId', locations.deletePhone);

  app.post('/services', services.create);
  app.patch('/services/:serviceId', services.update);

  app.get('/taxonomy', taxonomy.getAll);

  app.get('/organizations', organizations.find);
  app.post('/organizations', organizations.create);
  app.patch('/organizations/:organizationId', organizations.update);

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
