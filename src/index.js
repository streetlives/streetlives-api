import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import setupRoutes from './routes';
import config from './config';
import models from './models';

const app = express();
app.server = http.createServer(app);

app.use(morgan('dev'));

app.use(bodyParser.json());

setupRoutes(app);

models.sequelize.sync().then(() => {
  app.server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Started listening on port ${app.server.address().port}`);
  });
});

export default app;
