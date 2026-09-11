const { X509Certificate } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const { DEFAULT_CA_PATH, sslDialectOptions } = require('../../src/utils/ssl');

const CERTIFICATE =
  '-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../sequelize/migrations');

// src/config.js reads process.env at import time.
const loadAppConfig = (nodeEnv, overrides = {}) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, ...overrides };
  Object.keys(previous).forEach((key) => { previous[key] = process.env[key]; });
  Object.assign(process.env, { NODE_ENV: nodeEnv, ...overrides });
  try {
    jest.resetModules();
    return require('../../src/config').default; // eslint-disable-line global-require
  } finally {
    Object.keys(previous).forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
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
    expect(ssl.ca).toContain(CERTIFICATE);
  });

  it('accepts the bundle inline as well as by path', () => {
    const { ssl } = sslDialectOptions('production', { DATABASE_SSL_CA: CERTIFICATE });

    expect(ssl.ca).toContain(CERTIFICATE);
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it('refuses to connect rather than skip verification when no bundle is available', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here', 'bundle.pem');

    expect(() => sslDialectOptions('production', { DATABASE_SSL_CA_PATH: missing }))
      .toThrow(/truststore\.pki\.rds\.amazonaws\.com/);
  });

  it('leaves local and CI test databases unencrypted', () => {
    expect(sslDialectOptions('test', { DATABASE_HOST: 'localhost' })).toEqual({});
  });
});

describe('the trust store, across both kinds of RDS endpoint', () => {
  const subjectsOf = ca => ca
    .join('\n')
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .filter(block => block.includes('BEGIN CERTIFICATE'))
    .map(block => new X509Certificate(block).subject.replace(/\n/g, ' '));

  const host = 'streetlives.abc123.us-east-1.rds.amazonaws.com';
  const { ssl } = sslDialectOptions('production', { DATABASE_HOST: host });

  it('trusts the private CAs that sign instance endpoints', () => {
    expect(subjectsOf(ssl.ca).join(' | ')).toMatch(/Amazon RDS us-east-1 Root CA/);
  });

  it('still trusts the public roots an RDS Proxy certificate chains to', () => {
    // Node's `ca` option replaces the default trust store rather than adding to
    // it. RDS Proxy presents an ACM certificate under a public Amazon root, so
    // a bundle-only trust store fails verification against the proxy this app
    // is configured to use.
    expect(subjectsOf(ssl.ca).join(' | ')).toMatch(/CN=Amazon Root CA 1/);
    expect(ssl.ca.length).toBeGreaterThan(tls.rootCertificates.length);
  });
});

describe('when TLS is required', () => {
  const options = (nodeEnv, env) => sslDialectOptions(nodeEnv, env);
  const RDS = 'streetlives.abc123.us-east-1.rds.amazonaws.com';
  const PROXY = 'streetlives.proxy-abc123.us-east-1.rds.amazonaws.com';

  it('never negotiable for an RDS endpoint, instance or proxy', () => {
    [RDS, PROXY].forEach((host) => {
      // Not even by opting out: these carry real credentials.
      const { ssl } = options('development', { DATABASE_HOST: host, DATABASE_SSL: 'false' });
      expect(ssl.rejectUnauthorized).toBe(true);
    });
  });

  it('always on in production, whatever the host looks like', () => {
    expect(options('production', { DATABASE_HOST: 'localhost' }).ssl.rejectUnauthorized).toBe(true);
  });

  it('off for a local development database, which has no TLS to offer', () => {
    // `require: true` against a plain local Postgres fails outright with
    // "The server does not support SSL connections", which is what broke local
    // CLI migrations when the CLI config first grew these options.
    ['localhost', '127.0.0.1', '::1', undefined].forEach((host) => {
      expect(options('development', { DATABASE_HOST: host })).toEqual({});
    });
  });

  it('on by default for any other development host', () => {
    expect(options('development', { DATABASE_HOST: 'db.internal' }).ssl.rejectUnauthorized)
      .toBe(true);
  });

  it('opt-out-able for a non-RDS development host', () => {
    const env = { DATABASE_HOST: 'db.internal', DATABASE_SSL: 'false' };

    expect(options('development', env)).toEqual({});
    expect(options('development', { ...env, DATABASE_SSL: 'true' }).ssl.rejectUnauthorized)
      .toBe(true);
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
    const host = 'streetlives.abc123.us-east-1.rds.amazonaws.com';
    const { ssl } = loadAppConfig('production', { DATABASE_HOST: host }).db.options.dialectOptions;

    expect(ssl.require).toBe(true);
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca.join('\n')).toContain('BEGIN CERTIFICATE');
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
    const { dialectOptions } = loadAppConfig('test', { DATABASE_HOST: 'localhost' }).db.options;
    expect(dialectOptions.ssl).toBeUndefined();
  });
});
