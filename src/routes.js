import locations from './controllers/locations';
import services from './controllers/services';
import organizations from './controllers/organizations';
import taxonomy from './controllers/taxonomy';
import languages from './controllers/languages';
import comments from './controllers/comments';
import getUser from './middleware/get-user';
import { NotFoundError, AuthError } from './utils/errors';

export default (app) => {
  app.get('/organizations', organizations.find);
  app.post('/organizations', getUser, organizations.create);
  app.patch('/organizations/:organizationId', getUser, organizations.update);
  app.get('/organizations/:organizationId/locations', organizations.getLocations);

  app.get('/locations', locations.find);

  app.post('/locations/suggestions', locations.suggestNew);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations', getUser, locations.create);
  app.patch('/locations/:locationId', getUser, locations.update);

  app.post('/locations/:locationId/phones', getUser, locations.addPhone);
  app.patch('/phones/:phoneId', getUser, locations.updatePhone);
  app.delete('/phones/:phoneId', getUser, locations.deletePhone);

  app.post('/services', getUser, services.create);
  app.patch('/services/:serviceId', getUser, services.update);

  app.get('/taxonomy', taxonomy.getAll);
  app.get('/languages', languages.getAll);

  app.get('/comments', comments.get);
  app.post('/comments', comments.create);
  app.post('/comments/:commentId/reply', comments.reply);

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

    if (err instanceof AuthError) {
      return res.sendStatus(401);
    }

    return res.status(500).send({ error: err.stack });
  });
};
