import fs from 'fs';
import path from 'path';
import tls from 'tls';
import { parseBoolean } from './strings';

// AWS signs RDS *instance* endpoints with its own private CAs, which are not in
// Node's trust store, so the bundle has to travel with the code. This is the
// us-east-1 bundle - every deploy target in this repo is us-east-1. Refresh it,
// or switch regions, with:
//   curl -fsS -o src/certs/rds-us-east-1-bundle.pem \
//     https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem
// `npm run build` copies it to dist/certs (babel's -D), so it ships in the
// Lambda zip; __dirname resolves the same way in src/ and in dist/.
export const DEFAULT_CA_PATH = path.resolve(__dirname, '../certs/rds-us-east-1-bundle.pem');

// Anything ending here is an RDS endpoint - instance, cluster or proxy.
const RDS_ENDPOINT = /(^|\.)rds\.amazonaws\.com$/i;
const LOOPBACK_HOSTS = ['', 'localhost', '127.0.0.1', '::1'];

const fetchInstructions = () =>
  'Fetch the bundle for your region with:\n' +
  `  curl -fsS -o ${DEFAULT_CA_PATH} \\\n` +
  '    https://truststore.pki.rds.amazonaws.com/<region>/<region>-bundle.pem\n' +
  'or point DATABASE_SSL_CA_PATH / DATABASE_SSL_CA at a bundle of your own.';

const readRdsCertificates = (env) => {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA;

  const caPath = env.DATABASE_SSL_CA_PATH || DEFAULT_CA_PATH;
  if (!fs.existsSync(caPath)) {
    const reason = `No RDS certificate bundle at ${caPath}, so the database server's identity`;
    throw new Error(`${reason} cannot be verified. ${fetchInstructions()}`);
  }
  return fs.readFileSync(caPath, 'utf8');
};

// Node's `ca` option *replaces* the default trust store rather than adding to
// it. RDS Proxy - which this app connects through, hence the pool and pinning
// settings in config.js - presents an ACM certificate chaining to a public
// Amazon root, so trusting only the private RDS roots would fail verification
// against the proxy. Trust both: the public roots Node ships with, plus the RDS
// roots that no public store carries.
const trustStore = env => [...tls.rootCertificates, readRdsCertificates(env)];

// Verification is not optional anywhere a connection leaves the machine, but a
// local Postgres genuinely has no TLS to offer, and `require: true` against one
// fails with "The server does not support SSL connections". So: never for the
// test database, never when a developer opts out for a non-RDS host, and always
// otherwise - an RDS endpoint cannot be opted out of at all.
const sslRequired = (nodeEnv, env) => {
  const host = (env.DATABASE_HOST || '').trim();
  if (RDS_ENDPOINT.test(host)) return true;
  if (nodeEnv === 'test') return false;
  if (nodeEnv === 'production') return true;
  if (env.DATABASE_SSL != null) return parseBoolean(env.DATABASE_SSL, true);
  return !LOOPBACK_HOSTS.includes(host);
};

/**
 * Connection-level TLS settings, shared by the running app (src/config.js) and
 * by the Sequelize CLI (sequelize/config/database.js). Migrations use both: the
 * CLI opens its own connection for SequelizeMeta and queryInterface, and a
 * migration that imports src/models opens a second one through the app config.
 */
export const sslDialectOptions = (nodeEnv, env = process.env) => {
  if (!sslRequired(nodeEnv, env)) return {};

  return {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ca: trustStore(env),
    },
  };
};

export default { DEFAULT_CA_PATH, sslDialectOptions };
