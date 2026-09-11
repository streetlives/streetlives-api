const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_CA_PATH, sslDialectOptions } = require('../../sequelize/config/ssl');

const CERTIFICATE =
  '-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----';

describe('migration connection SSL options', () => {
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
      .toThrow(/certificate bundle/);
  });

  it('names the bundle it wanted and how to fetch it', () => {
    const missing = path.join(os.tmpdir(), 'definitely-not-here', 'bundle.pem');

    // What a developer running migrations by hand hits; CI overrides the path.
    expect(DEFAULT_CA_PATH).toMatch(/certs\/rds-global-bundle\.pem$/);
    expect(() => sslDialectOptions('production', { DATABASE_SSL_CA_PATH: missing }))
      .toThrow(/truststore\.pki\.rds\.amazonaws\.com/);
  });

  it('leaves local and CI test databases unencrypted', () => {
    expect(sslDialectOptions('test', {})).toEqual({});
  });
});
