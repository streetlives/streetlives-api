import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import setupRoutes from './routes';
import { publicApiCors, internalLocationCatalogCors } from './services/internal-location-catalog-cors';

const app = express();

app.use(morgan('dev'));

app.use((req, res, next) => {
  if (req.path === '/locations/catalog') {
    return internalLocationCatalogCors(req, res, next);
  }
  return publicApiCors(req, res, next);
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(awsServerlessExpressMiddleware.eventContext());
}

app.use(bodyParser.json());

setupRoutes(app);

export default app;
