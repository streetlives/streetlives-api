/**
 * @jest-environment node
 */
/* eslint-disable no-console */

// GET /locations-by-slug/:slug through the Valkey cache (src/services/cache.js), with the real
// ioredis client. The suites that need a running server are skipped when CACHE_URL is unset; CI
// provides one (.github/workflows/ci.yml). The fail-open suite needs no server and always runs.

import Redis from 'ioredis';
import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';
import * as cache from '../../src/services/cache';

const { CACHE_URL } = process.env;
const describeWithServer = CACHE_URL ? describe : describe.skip;
// Jest 24 still runs the hooks of a skipped describe, so they check for a server themselves.
const withServer = hook => () => (CACHE_URL ? hook() : undefined);

describe('locations-by-slug cache', () => {
  const originalEnv = { ...process.env };
  let location;
  let slug;

  beforeAll(async () => {
    const organization = await models.Organization.create({ name: 'Cache Test Org' });
    location = await organization.createLocation(
      {
        name: 'Cached center',
        description: 'Original description',
        position: geometry.createPoint(-73.991303, 40.751908),
        PhysicalAddresses: [{
          address_1: '123 W 30th St.',
          city: 'New York',
          state_province: 'NY',
          postal_code: '10001',
          country: 'US',
        }],
      },
      { include: [models.PhysicalAddress] },
    );
    ({ slug } = await models.Location.findByPk(location.id));
  });

  const useCache = async (env) => {
    await cache.resetForTesting();
    process.env = { ...originalEnv, ...env };
  };

  afterEach(async () => {
    await cache.resetForTesting();
    process.env = { ...originalEnv };
  });

  it('serves straight from Postgres, with no X-Cache header, when the cache is off', async () => {
    await useCache({ CACHE_ENABLED: 'false' });
    const res = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
    expect(res.body.id).toBe(location.id);
    expect(res.headers['x-cache']).toBeUndefined();
  });

  describe('when the cache is unreachable', () => {
    beforeEach(async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      // Nothing listens on port 1, so every connection attempt is refused.
      await useCache({
        CACHE_ENABLED: 'true',
        CACHE_URL: 'redis://127.0.0.1:1',
        CACHE_CONNECT_TIMEOUT_MS: '200',
      });
    });

    afterEach(() => jest.restoreAllMocks());

    it('still answers reads from Postgres', async () => {
      const res = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(res.body.id).toBe(location.id);
      expect(res.headers['x-cache']).toBe('BYPASS');
    });

    it('still commits writes, and logs that invalidation failed', async () => {
      await request(app)
        .patch(`/locations/${location.id}`)
        .send({ additionalInfo: 'Written while the cache was down' })
        .expect(204);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('invalidation failed'));
    });
  });

  describeWithServer('with a running cache', () => {
    beforeAll(withServer(async () => {
      const admin = new Redis(CACHE_URL);
      await admin.flushall();
      admin.disconnect();
    }));

    beforeEach(withServer(async () => {
      await useCache({ CACHE_ENABLED: 'true' });
      expect(await cache.connect()).toBe(true);
    }));

    it('misses, then hits with the same body', async () => {
      const miss = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(miss.headers['x-cache']).toBe('MISS');

      const hit = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(hit.headers['x-cache']).toBe('HIT');
      expect(hit.headers['content-type']).toMatch(/^application\/json/);
      expect(hit.text).toBe(miss.text);
    });

    it('drops the cached response when a write commits', async () => {
      await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect((await request(app).get(`/locations-by-slug/${slug}`)).headers['x-cache']).toBe('HIT');

      await request(app)
        .patch(`/locations/${location.id}`)
        .send({ description: 'Updated description' })
        .expect(204);

      const afterWrite = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(afterWrite.headers['x-cache']).toBe('MISS');
      expect(afterWrite.body.description).toBe('Updated description');

      const again = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(again.headers['x-cache']).toBe('HIT');
      expect(again.body.description).toBe('Updated description');
    });

    it('does not cache a 404', async () => {
      await request(app).get('/locations-by-slug/no-such-slug').expect(404);
      const res = await request(app).get('/locations-by-slug/no-such-slug').expect(404);
      expect(res.headers['x-cache']).toBeUndefined();
    });
  });
});
