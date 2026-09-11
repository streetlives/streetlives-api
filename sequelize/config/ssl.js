const fs = require('fs');
const path = require('path');

// AWS publishes one PEM bundle covering every RDS regional CA:
//   https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
// CI fetches it into the runner's temp directory and points DATABASE_SSL_CA_PATH
// at it (see .github/actions/db-migrate). The repo-relative default below is for
// running migrations by hand: fetch the bundle to that path once and it is used
// automatically.
const DEFAULT_CA_PATH = path.resolve(__dirname, '../../certs/rds-global-bundle.pem');

const fetchInstructions = () =>
  `  mkdir -p ${path.dirname(DEFAULT_CA_PATH)} && \\\n` +
  `    curl -fsS -o ${DEFAULT_CA_PATH} \\\n` +
  '    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem\n' +
  'or point DATABASE_SSL_CA_PATH / DATABASE_SSL_CA at a bundle of your own.';

// Verifying the server certificate is what makes it safe to send the database
// credentials at all: without it, anything that answers on the endpoint can
// present a certificate of its own and collect them.
const readCertificateAuthority = (env = process.env) => {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA;

  const caPath = env.DATABASE_SSL_CA_PATH || DEFAULT_CA_PATH;
  if (!fs.existsSync(caPath)) {
    const reason = `No RDS certificate bundle at ${caPath}, so the database server's identity`;
    throw new Error(`${reason} cannot be verified. Fetch it with:\n${fetchInstructions()}`);
  }
  return fs.readFileSync(caPath, 'utf8');
};

// Local and CI test databases run without SSL; RDS everywhere else requires it.
const sslDialectOptions = (nodeEnv, env = process.env) => {
  if (nodeEnv === 'test') return {};

  return {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ca: readCertificateAuthority(env),
    },
  };
};

module.exports = { DEFAULT_CA_PATH, sslDialectOptions };
