import locations from './controllers/locations';

export default (app) => {
  app.get('/locations', locations.find);
  app.post('/locations', locations.suggestNew);

  app.get('/locations/:id', locations.getInfo);
  app.post('/locations/:id/rating', locations.rate);
  app.post('/locations/:id/comment', locations.addComment);

  app.use((err, req, res, next) => {
    res.status(500).send({ error: err.stack });
  });

  app.use((req, res) => {
    const payload = {
      url: req.originalUrl,
      error: 'Not found',
    };
    return res.status(404).json(payload);
  });
};
