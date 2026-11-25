import awsServerlessExpress from 'aws-serverless-express';
import app from './app';
import { warmLocationCache } from './services/cache-warm';

const binaryMimeTypes = [
  'application/javascript',
  'application/json',
  'application/octet-stream',
  'application/xml',
  'font/eot',
  'font/opentype',
  'font/otf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'text/comma-separated-values',
  'text/css',
  'text/html',
  'text/javascript',
  'text/plain',
  'text/text',
  'text/xml',
];
const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);

// Leaves time to return the result before the function's own timeout.
const WARM_SAFETY_MARGIN_MS = 5000;

exports.handler = (event, context) => {
  // A direct invocation (`aws lambda invoke`, which needs lambda:InvokeFunction), never an API
  // Gateway request: a proxy event has no top-level cacheTask for a caller to set.
  if (event && event.cacheTask === 'warm') {
    return warmLocationCache({
      flush: Boolean(event.flush),
      startAfter: event.startAfter || null,
      deadline: (Date.now() + context.getRemainingTimeInMillis()) - WARM_SAFETY_MARGIN_MS,
    });
  }
  return awsServerlessExpress.proxy(server, event, context);
};
