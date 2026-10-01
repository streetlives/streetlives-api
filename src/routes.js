import locations from './controllers/locations';
import services from './controllers/services';
import organizations from './controllers/organizations';
import taxonomy from './controllers/taxonomy';
import languages from './controllers/languages';
import geocode from './controllers/geocode';
import comments from './controllers/comments';
import commentHighlights from './controllers/comment-highlights';
import errorReports from './controllers/error-reports';
import getUser from './middleware/get-user';
import dataEntryAuth from './middleware/data-entry-auth';
import { LOCATION_PHOTO_ROUTE } from './utils/photo-upload-path';
import {
  NotFoundError,
  AuthError,
  ForbiddenError,
  ValidationError,
  ServiceUnavailableError,
} from './utils/errors';

export default (app) => {
  app.get('/organizations', organizations.find);
  app.post('/organizations', getUser, dataEntryAuth(), organizations.create);
  app.patch('/organizations/:organizationId', getUser, dataEntryAuth(), organizations.update);
  app.get('/organizations/:organizationId/locations', organizations.getLocations);

  app.get('/locations', locations.find);

  app.post('/locations/suggestions', locations.suggestNew);
  app.get('/locations-by-slug/:slug', locations.getInfoBySlug);
  app.get('/location-slug-redirects/:slug', locations.getRedirectBySlug);

  app.get('/locations/:locationId', locations.getInfo);
  app.post('/locations', getUser, dataEntryAuth(['organizationId']), locations.create);
  app.patch('/locations/:locationId', getUser, dataEntryAuth(['organizationId']), locations.update);

  app.post('/locations/:locationId/phones', getUser, dataEntryAuth(), locations.addPhone);

  // Organization-provided photo that replaces the Street View still on yourpeer.nyc.
  // dataEntryAuth() takes no body allowlist on purpose: scope comes entirely from
  // the locationId param, and no body field of these routes names an organization.
  app.put(LOCATION_PHOTO_ROUTE, getUser, dataEntryAuth(), locations.setPhoto);
  app.delete(LOCATION_PHOTO_ROUTE, getUser, dataEntryAuth(), locations.deletePhoto);
  app.patch('/phones/:phoneId', getUser, dataEntryAuth(), locations.updatePhone);
  app.delete('/phones/:phoneId', getUser, dataEntryAuth(), locations.deletePhone);

  app.post('/services', getUser, dataEntryAuth(['locationId']), services.create);
  app.get('/services/get-count', services.getCount);
  app.patch('/services/:serviceId', getUser, dataEntryAuth(), services.update);
  app.delete('/services/:serviceId', getUser, dataEntryAuth(), services.delete);

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

    if (err instanceof ServiceUnavailableError
      || err.name === 'PhotoStorageUnavailableError') {
      return res.status(503).send({ error: err.message });
    }

    // body-parser rejects an oversized body with this before any route runs.
    // Without the branch it falls through to the 500 below and answers with a
    // stack trace, which is wrong for every route, not just the photo upload.
    if (err.type === 'entity.too.large') {
      return res.status(413).send({ error: 'Request body too large' });
    }

    // eslint-disable-next-line no-console
    console.error('Server error:', err.message, err.stack);
    return res.status(500).send({ error: err.stack });
  });
};
