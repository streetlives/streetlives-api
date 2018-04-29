import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import setupRoutes from './routes';

const app = express();

app.use(morgan('dev'));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(awsServerlessExpressMiddleware.eventContext());

app.use(bodyParser.json());

setupRoutes(app);

export default app;
