import fs from 'fs';
import path from 'path';

// AWS signs RDS endpoints with its own private CAs, which are not in Node's
// trust store, so the bundle has to travel with the code. This is the us-east-1
// bundle - every deploy target in this repo is us-east-1. Refresh it, or switch
// regions, with:
//   curl -fsS -o src/certs/rds-us-east-1-bundle.pem \
//     https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem
// `npm run build` copies it to dist/certs (babel's -D), so it ships in the
// Lambda zip; __dirname resolves the same way in src/ and in dist/.
export const DEFAULT_CA_PATH = path.resolve(__dirname, '../certs/rds-us-east-1-bundle.pem');

const fetchInstructions = () =>
  'Fetch the bundle for your region with:\n' +
  `  curl -fsS -o ${DEFAULT_CA_PATH} \\\n` +
  '    https://truststore.pki.rds.amazonaws.com/<region>/<region>-bundle.pem\n' +
  'or point DATABASE_SSL_CA_PATH / DATABASE_SSL_CA at a bundle of your own.';

// Verifying the server certificate is what makes it safe to send the database
// credentials at all: without it, anything that answers on the endpoint can
// present a certificate of its own and collect them.
const readCertificateAuthority = (env) => {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA;

  const caPath = env.DATABASE_SSL_CA_PATH || DEFAULT_CA_PATH;
  if (!fs.existsSync(caPath)) {
    const reason = `No RDS certificate bundle at ${caPath}, so the database server's identity`;
    throw new Error(`${reason} cannot be verified. ${fetchInstructions()}`);
  }
  return fs.readFileSync(caPath, 'utf8');
};

/**
 * Connection-level TLS settings, shared by the running app (src/config.js) and
 * by the Sequelize CLI (sequelize/config/database.js). Migrations use both:
 * the CLI opens its own connection for SequelizeMeta and queryInterface, and a
 * migration that imports src/models opens a second one through the app config.
 *
 * Local and CI test databases run without SSL; RDS everywhere else requires it.
 */
export const sslDialectOptions = (nodeEnv, env = process.env) => {
  if (nodeEnv === 'test') return {};

  return {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ca: readCertificateAuthority(env),
    },
  };
};

export default { DEFAULT_CA_PATH, sslDialectOptions };
