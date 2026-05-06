import express from 'express';
import request from 'supertest';

const ORIGINAL_ENV = process.env;

const buildCorsSelectorApp = ({
  allowedHosts = 'sheets.doobneek.org',
  allowedOriginPatterns = 'chrome-extension://*',
} = {}) => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    INTERNAL_LOCATION_CATALOG_ALLOWED_HOSTS: allowedHosts,
    INTERNAL_LOCATION_CATALOG_ALLOWED_ORIGIN_PATTERNS: allowedOriginPatterns,
  };

  const {
    publicApiCors,
    internalLocationCatalogCors,
  } = require('../../src/services/internal-location-catalog-cors');

  const app = express();
  app.use((req, res, next) => {
    const useInternalCors = req.path === '/locations/catalog'
      || req.path.startsWith('/locations/catalog/');
    if (useInternalCors) {
      return internalLocationCatalogCors(req, res, next);
    }
    return publicApiCors(req, res, next);
  });
  app.options('/locations/catalog', (req, res) => res.sendStatus(204));
  app.options('/locations/catalog/', (req, res) => res.sendStatus(204));
  app.get('/locations/catalog', (req, res) => res.sendStatus(200));
  app.get('/locations/catalog/', (req, res) => res.sendStatus(200));
  app.get('/locations/other', (req, res) => res.sendStatus(200));

  return app;
};

describe('internal location catalog CORS', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows preflight requests from sheets.doobneek.org', async () => {
    const app = buildCorsSelectorApp();

    await request(app)
      .options('/locations/catalog')
      .set('Origin', 'https://sheets.doobneek.org')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'https://sheets.doobneek.org');
  });

  it('allows preflight requests from configured extension origins', async () => {
    const app = buildCorsSelectorApp();

    await request(app)
      .options('/locations/catalog')
      .set('Origin', 'chrome-extension://abcdefghijklmnop')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'chrome-extension://abcdefghijklmnop');
  });

  it('does not emit allow-origin headers for disallowed browser origins', async () => {
    const app = buildCorsSelectorApp();

    const res = await request(app)
      .options('/locations/catalog')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the restricted catalog CORS policy for trailing-slash variants', async () => {
    const app = buildCorsSelectorApp();

    const res = await request(app)
      .options('/locations/catalog/')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still leaves unrelated routes on the public CORS policy', async () => {
    const app = buildCorsSelectorApp();

    await request(app)
      .get('/locations/other')
      .set('Origin', 'https://example.com')
      .expect(200)
      .expect('Access-Control-Allow-Origin', '*');
  });
});
