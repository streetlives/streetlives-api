#!/usr/bin/env node
import { modifyFiles } from './utils';
import packageJson from '../package.json';

const { config } = packageJson;

modifyFiles(['./simple-proxy-api.yaml', './package.json', './cloudformation.yaml'], [{
  regexp: new RegExp(config.accountId, 'g'),
  replacement: 'YOUR_ACCOUNT_ID',
}, {
  regexp: new RegExp(config.region, 'g'),
  replacement: 'YOUR_AWS_REGION',
}, {
  regexp: new RegExp(config.s3BucketName, 'g'),
  replacement: 'YOUR_UNIQUE_BUCKET_NAME',
}, {
  regexp: new RegExp(config.functionName, 'g'),
  replacement: 'YOUR_SERVERLESS_EXPRESS_LAMBDA_FUNCTION_NAME',
}]);
