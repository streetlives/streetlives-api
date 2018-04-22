#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import minimist from 'minimist';
import { exec } from 'child_process';
import { modifyFiles } from './utils';

let minimistHasBeenInstalled = false;

if (!fs.existsSync('./node_modules/minimist')) {
  exec('npm install minimist --silent');
  minimistHasBeenInstalled = true;
}

const args = minimist(process.argv.slice(2), {
  string: [
    'account-id',
    'bucket-name',
    'function-name',
    'region',
  ],
  default: {
    region: 'us-east-1',
    'function-name': 'AwsServerlessExpressFunction',
  },
});

if (minimistHasBeenInstalled) {
  exec('npm uninstall minimist --silent');
}

const accountId = args['account-id'];
const bucketName = args['bucket-name'];
const functionName = args['function-name'];
const { region } = args;
const availableRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
];

if (!accountId || accountId.length !== 12) {
  console.error('You must supply a 12 digit account id as --account-id="<accountId>"');
  process.exit(1);
}

if (!bucketName) {
  console.error('You must supply a bucket name as --bucket-name="<bucketName>"');
  process.exit(1);
}

if (availableRegions.indexOf(region) === -1) {
  const regions = availableRegions.join(', ');
  console.error(`Amazon API Gateway and Lambda are not available in the ${region} region.
Available regions: ${regions}`);
  process.exit(1);
}

modifyFiles(['./simple-proxy-api.yaml', './package.json', './cloudformation.yaml'], [{
  regexp: /YOUR_ACCOUNT_ID/g,
  replacement: accountId,
}, {
  regexp: /YOUR_AWS_REGION/g,
  replacement: region,
}, {
  regexp: /YOUR_UNIQUE_BUCKET_NAME/g,
  replacement: bucketName,
}, {
  regexp: /YOUR_SERVERLESS_EXPRESS_LAMBDA_FUNCTION_NAME/g,
  replacement: functionName,
}]);
