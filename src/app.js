import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import setupRoutes from './routes';
import { isPhotoUpload } from './utils/photo-upload-path';

const app = express();

app.use(morgan('dev'));

app.use(cors());

// Only the location-photo upload may exceed body-parser's 100KB default. A
// route-level parser would be too late - the app-level one runs first and
// would 413 before the route is matched - so the limit is chosen here, per
// request. 6mb sits above the 4MiB decoded cap the schema enforces, so a
// slightly oversized upload gets a clean 400 naming the limit rather than an
// opaque 413.
const defaultJsonParser = bodyParser.json();
const photoJsonParser = bodyParser.json({ limit: '6mb' });
app.use((req, res, next) =>
  (isPhotoUpload(req) ? photoJsonParser : defaultJsonParser)(req, res, next));

app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(awsServerlessExpressMiddleware.eventContext());
}

// Kept for the case where the dispatcher above skipped a request with no body:
// body-parser short-circuits once req._body is set, so this re-parses nothing.
app.use(bodyParser.json());

setupRoutes(app);

export default app;
