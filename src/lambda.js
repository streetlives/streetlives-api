import awsServerlessExpress from 'aws-serverless-express';
import app from './app';
import { drainMetadataEvents } from './services/change-feed-events';

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

exports.handler = (event, context) => {
  if (event && event.source === 'streetlives.change-feed-retry'
    && event['detail-type'] === 'Retry metadata event delivery') {
    return drainMetadataEvents();
  }
  return awsServerlessExpress.proxy(server, event, context);
};
