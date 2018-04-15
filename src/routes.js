import locations from './controllers/locations';
import services from './controllers/services';
import organizations from './controllers/organizations';
import { NotFoundError } from './utils/errors';

// TODO: Update everything in the API documentation.
// TODO: Add tests.
export default (app) => {
  app.get('/locations', locations.find);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations', locations.create);
  app.patch('/locations/:locationId', locations.update);

  app.post('/locations/:locationId/phones', locations.addPhone);
  app.patch('/locations/:locationId/phones/:phoneId', locations.updatePhone);
  app.delete('/locations/:locationId/phones/:phoneId', locations.deletePhone);

  app.post('/locations/suggestions', locations.suggestNew);
  app.post('/locations/:locationId/comments', locations.addComment);

  app.post('/services', services.create);
  app.patch('/services/:serviceId', services.update);
  // TODO: Possibly a route for getting the taxonomy.

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
