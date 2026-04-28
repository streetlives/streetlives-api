import awsServerlessExpress from 'aws-serverless-express';
import app from './app';
import { runDueScheduledActions } from './services/scheduled-actions';

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

const isScheduledActionsEvent = event => (
  event && (
    event.source === 'aws.events' ||
    event.source === 'streetlives-api.scheduled-actions' ||
    event['detail-type'] === 'Scheduled Event'
  )
);

exports.handler = async (event, context) => {
  if (isScheduledActionsEvent(event)) {
    const result = await runDueScheduledActions({ triggeredBy: 'aws.events' });
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  }

  return awsServerlessExpress.proxy(server, event, context);
};
