import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import setupRoutes from './routes';
// import models from './models';

const app = express();

app.use(morgan('dev'));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(awsServerlessExpressMiddleware.eventContext());

app.use(bodyParser.json());

setupRoutes(app);

// TODO: Decide what to do about this (at least needs fixing for tests).
// models.sequelize.sync();

export default app;
