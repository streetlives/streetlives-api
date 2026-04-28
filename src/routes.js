import locations from './controllers/locations';
import services from './controllers/services';
import organizations from './controllers/organizations';
import scheduledActions from './controllers/scheduled-actions';
import taxonomy from './controllers/taxonomy';
import languages from './controllers/languages';
import geocode from './controllers/geocode';
import comments from './controllers/comments';
import commentHighlights from './controllers/comment-highlights';
import errorReports from './controllers/error-reports';
import getUser from './middleware/get-user';
import dataEntryAuth from './middleware/data-entry-auth';
import {
  NotFoundError,
  AuthError,
  ForbiddenError,
  ValidationError,
} from './utils/errors';

export default (app) => {
  app.get('/scheduled-actions', getUser, scheduledActions.list);
  app.delete('/scheduled-actions/:scheduledActionId', getUser, scheduledActions.cancel);
  app.post('/scheduled-actions/run-due', getUser, scheduledActions.runDue);
  app.post('/scheduled-patches', getUser, dataEntryAuth, scheduledActions.createPatch);
  app.post('/scheduled-deletions', getUser, dataEntryAuth, scheduledActions.createDeletion);

  app.get('/organizations', organizations.find);
  app.post('/organizations', getUser, dataEntryAuth, organizations.create);
  app.patch('/organizations/:organizationId', getUser, dataEntryAuth, organizations.update);
  app.get('/organizations/:organizationId/locations', organizations.getLocations);

  app.get('/locations', locations.find);

  app.post('/locations/suggestions', locations.suggestNew);
  app.get('/locations-by-slug/:slug', locations.getInfoBySlug);
  app.get('/location-slug-redirects/:slug', locations.getRedirectBySlug);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations', getUser, dataEntryAuth, locations.create);
  app.patch('/locations/:locationId', getUser, dataEntryAuth, locations.update);

  app.post('/locations/:locationId/phones', getUser, dataEntryAuth, locations.addPhone);
  app.patch('/phones/:phoneId', getUser, dataEntryAuth, locations.updatePhone);
  app.delete('/phones/:phoneId', getUser, locations.deletePhone);

  app.post('/services', getUser, dataEntryAuth, services.create);
  app.get('/services/get-count', services.getCount);
  app.patch('/services/:serviceId', getUser, dataEntryAuth, services.update);
  app.delete('/services/:serviceId', getUser, services.delete);

  app.get('/geocode/analytics/all', geocode.findAnalytics);

  app.get('/taxonomy', taxonomy.getAll);
  app.get('/languages', languages.getAll);

  app.get('/comments', comments.get);
  app.post('/comments', comments.create);
  app.put('/comments/email/:commentId', comments.setEmail);
  app.put('/comments/report/:commentId', comments.report);
  app.put('/comments/unreport/:commentId', comments.unReport);
  app.put('/comments/like/:commentId', comments.like);
  app.delete('/comments/like/:commentId', comments.like);

  app.post('/comments/:commentId/reply', getUser, comments.reply);
  app.delete('/comments/:commentId', getUser, comments.delete);
  app.put('/comments/:commentId/hidden', getUser, comments.setHidden);
  app.put('/comments/:commentId/exclude', getUser, comments.excludeFromHighlights);
  app.put('/comments/replies/:replyId', getUser, comments.editReply);

  app.get('/comment-highlights', commentHighlights.getHighlights);
  app.post('/generate-highlights', commentHighlights.generateHighlights);
  app.post('/regenerate-highlights', commentHighlights.regenerateHighlights);

  app.get('/errorreports', getUser, errorReports.get);
  app.post('/errorreports', errorReports.create);
  app.delete('/errorreports/:errorReportId', getUser, errorReports.delete);

  app.use((req, res) => res.status(404).send({
    url: req.originalUrl,
    error: 'Not found',
  }));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err.name === 'ValidationError' || err instanceof ValidationError) {
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

    if (err instanceof ForbiddenError) {
      return res.status(403).send({ error: err.message });
    }

    // eslint-disable-next-line no-console
    console.error('Server error:', err.message, err.stack);
    return res.status(500).send({ error: err.stack });
  });
};
