import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import setupRoutes from './routes';

const app = express();
const exposedHeaders = [
  'Pagination-Count',
  'Total-Count',
  'Page-Number',
  'Page-Size',
  'Has-More',
  'Next-Page',
];

app.use(morgan('dev'));

app.use(cors({ exposedHeaders }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(awsServerlessExpressMiddleware.eventContext());
}

app.use(bodyParser.json());

setupRoutes(app);

export default app;
