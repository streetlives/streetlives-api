const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_CA_PATH, sslDialectOptions } = require('../../src/utils/ssl');

const CERTIFICATE =
  '-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../sequelize/migrations');

// src/config.js reads process.env at import time.
const loadAppConfig = (nodeEnv) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    jest.resetModules();
    return require('../../src/config').default; // eslint-disable-line global-require
  } finally {
    process.env.NODE_ENV = previous;
    jest.resetModules();
  }
};

describe('database TLS options', () => {
  let caFile;

  beforeAll(() => {
    caFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rds-ca-')), 'bundle.pem');
    fs.writeFileSync(caFile, CERTIFICATE);
  });

  it('verifies the server certificate against the configured bundle', () => {
    const { ssl } = sslDialectOptions('production', { DATABASE_SSL_CA_PATH: caFile });

    expect(ssl.require).toBe(true);
    // Without verification, anything answering on the RDS endpoint can present
    // its own certificate and collect the production database credentials.
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(CERTIFICATE);
  });

  it('accepts the bundle inline as well as by path', () => {
    const { ssl } = sslDialectOptions('production', { DATABASE_SSL_CA: CERTIFICATE });

    expect(ssl.ca).toBe(CERTIFICATE);
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it('refuses to connect rather than skip verification when no bundle is available', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here', 'bundle.pem');

    expect(() => sslDialectOptions('production', { DATABASE_SSL_CA_PATH: missing }))
      .toThrow(/truststore\.pki\.rds\.amazonaws\.com/);
  });

  it('leaves local and CI test databases unencrypted', () => {
    expect(sslDialectOptions('test', {})).toEqual({});
  });
});

describe('the certificate bundle that ships with the code', () => {
  it('is present and holds real certificates', () => {
    const bundle = fs.readFileSync(DEFAULT_CA_PATH, 'utf8');

    expect(bundle.split('BEGIN CERTIFICATE').length - 1).toBeGreaterThan(0);
  });

  it('lives under src/, so the build copies it into the Lambda zip', () => {
    // `npm run build` is `babel src -d dist -D`; -D copies non-compilable files,
    // which is the only reason the bundle exists at runtime. __dirname resolves
    // the same relative path in src/ and in dist/.
    const shipped = path.resolve(__dirname, '../../src/certs/rds-us-east-1-bundle.pem');
    expect(DEFAULT_CA_PATH).toBe(shipped);
  });
});

describe('the connection a model-backed migration opens', () => {
  it('is a real case, not a hypothetical one', () => {
    const importers = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.js'))
      .filter(file => /['"][./]*\.\.\/\.\.\/src\/models['"]/
        .test(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')));

    expect(importers.length).toBeGreaterThan(0);
  });

  it('verifies the certificate, exactly like the CLI connection', () => {
    // The CLI config covers SequelizeMeta and queryInterface. A migration that
    // imports src/models opens a second connection through the app config, with
    // the same production credentials on it.
    const { ssl } = loadAppConfig('production').db.options.dialectOptions;

    expect(ssl.require).toBe(true);
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toContain('BEGIN CERTIFICATE');
  });

  it('shares one implementation with the CLI config, so they cannot drift', () => {
    const cliConfigPath = path.resolve(__dirname, '../../sequelize/config/database.js');
    const cliConfig = fs.readFileSync(cliConfigPath, 'utf8');
    const appConfig = fs.readFileSync(path.resolve(__dirname, '../../src/config.js'), 'utf8');

    expect(cliConfig).toContain('sslDialectOptions');
    expect(appConfig).toContain('sslDialectOptions');
    expect(appConfig).not.toContain('rejectUnauthorized');
  });

  it('still runs unencrypted against the CI and local test databases', () => {
    expect(loadAppConfig('test').db.options.dialectOptions.ssl).toBeUndefined();
  });
});
