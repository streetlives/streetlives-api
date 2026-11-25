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
import { warmLocationCache } from '../../src/services/cache-warm';

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

    // Shut the client down while console.error is still mocked, so its reconnect attempts
    // don't log after the test.
    afterEach(async () => {
      await cache.resetForTesting();
      jest.restoreAllMocks();
    });

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
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('invalidation'));
    });
  });

  describeWithServer('with a running cache', () => {
    let admin;
    let otherLocation;
    let otherSlug;

    const xCache = async path => (await request(app).get(path)).headers['x-cache'];

    beforeAll(withServer(async () => {
      admin = new Redis(CACHE_URL);
      const organization = await models.Organization.create({ name: 'Other Cache Org' });
      otherLocation = await organization.createLocation(
        {
          name: 'Untouched center',
          position: geometry.createPoint(-73.95, 40.8),
          PhysicalAddresses: [{
            address_1: '1 Other St.',
            city: 'New York',
            state_province: 'NY',
            postal_code: '10027',
            country: 'US',
          }],
        },
        { include: [models.PhysicalAddress] },
      );
      ({ slug: otherSlug } = await models.Location.findByPk(otherLocation.id));
    }));

    afterAll(withServer(() => admin.disconnect()));

    beforeEach(withServer(async () => {
      await admin.flushall();
      await useCache({ CACHE_ENABLED: 'true' });
      expect(await cache.connect()).toBe(true);
    }));

    it('misses, then hits with the same body, and keeps it with no expiry', async () => {
      const miss = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(miss.headers['x-cache']).toBe('MISS');

      const hit = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(hit.headers['x-cache']).toBe('HIT');
      expect(hit.headers['content-type']).toMatch(/^application\/json/);
      expect(hit.text).toBe(miss.text);

      expect(await admin.ttl(`locations:{${slug}}:body`)).toBe(-1);
    });

    it('drops only the edited location when a write commits', async () => {
      await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      await request(app).get(`/locations-by-slug/${otherSlug}`).expect(200);

      await request(app)
        .patch(`/locations/${location.id}`)
        .send({ description: 'Updated description' })
        .expect(204);

      const afterWrite = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(afterWrite.headers['x-cache']).toBe('MISS');
      expect(afterWrite.body.description).toBe('Updated description');
      expect(await xCache(`/locations-by-slug/${slug}`)).toBe('HIT');

      expect(await xCache(`/locations-by-slug/${otherSlug}`)).toBe('HIT');
    });

    it('drops a location when a row that belongs to it is created or deleted', async () => {
      await request(app).get(`/locations-by-slug/${slug}`).expect(200);

      await request(app)
        .post(`/locations/${location.id}/phones`)
        .send({ number: '2125551234' })
        .expect(201);
      const withPhone = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(withPhone.headers['x-cache']).toBe('MISS');
      const phone = withPhone.body.Phones.find(({ number }) => number === '2125551234');
      expect(phone).toBeDefined();

      await request(app).delete(`/phones/${phone.id}`).expect(204);
      const withoutPhone = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(withoutPhone.headers['x-cache']).toBe('MISS');
      expect(withoutPhone.body.Phones.map(({ id }) => id)).not.toContain(phone.id);
    });

    it('drops a location when one of its services is updated or deleted', async () => {
      const taxonomy = await models.Taxonomy.create({ name: 'Cache Test Category' });
      const { body: service } = await request(app)
        .post('/services')
        .send({ name: 'Cached service', taxonomyId: taxonomy.id, locationId: location.id })
        .expect(201);

      await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      await request(app).get(`/locations-by-slug/${otherSlug}`).expect(200);

      await request(app)
        .patch(`/services/${service.id}`)
        .send({ description: 'Renamed in place' })
        .expect(204);
      const updated = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(updated.headers['x-cache']).toBe('MISS');
      expect(updated.body.Services.find(({ id }) => id === service.id).description)
        .toBe('Renamed in place');

      // The service's links to its locations go with it, so this one is resolved before delete.
      await request(app).delete(`/services/${service.id}`).expect(204);
      const deleted = await request(app).get(`/locations-by-slug/${slug}`).expect(200);
      expect(deleted.headers['x-cache']).toBe('MISS');
      expect(deleted.body.Services.map(({ id }) => id)).not.toContain(service.id);

      expect(await xCache(`/locations-by-slug/${otherSlug}`)).toBe('HIT');
    });

    it('stops serving the old slug when an organization rename changes it', async () => {
      await request(app).get(`/locations-by-slug/${otherSlug}`).expect(200);
      expect(await xCache(`/locations-by-slug/${otherSlug}`)).toBe('HIT');

      await request(app)
        .patch(`/organizations/${otherLocation.organization_id}`)
        .send({ name: 'Renamed Cache Org' })
        .expect(204);

      const { slug: newSlug } = await models.Location.findByPk(otherLocation.id);
      expect(newSlug).not.toBe(otherSlug);
      await request(app).get(`/locations-by-slug/${otherSlug}`).expect(404);
      otherSlug = newSlug;
    });

    it('refuses to store a response read before an invalidation', async () => {
      const { token } = await cache.getCachedLocationResponse(slug);
      await cache.invalidateLocationSlugs([slug]);
      expect(await cache.setCachedLocationResponse(token, '{"stale":true}')).toBe(false);
      expect(await xCache(`/locations-by-slug/${slug}`)).toBe('MISS');
    });

    it('expires a response at the start of the day after its holiday schedule ends', async () => {
      const { token } = await cache.getCachedLocationResponse(slug);
      const expiresAt = new Date(Date.now() + 60000);
      expect(await cache.setCachedLocationResponse(token, '{}', expiresAt)).toBe(true);
      const pttl = await admin.pttl(`locations:{${slug}}:body`);
      expect(pttl).toBeGreaterThan(0);
      expect(pttl).toBeLessThanOrEqual(60000);
    });

    it('warms every location, then leaves cached ones alone', async () => {
      const first = await warmLocationCache();
      // Other suites' fixtures may include locations without an address, which can't be built.
      expect(first.failed).not.toContain(slug);
      expect(first.warmed).toBeGreaterThanOrEqual(2);
      expect(await xCache(`/locations-by-slug/${slug}`)).toBe('HIT');
      expect(await xCache(`/locations-by-slug/${otherSlug}`)).toBe('HIT');

      const second = await warmLocationCache();
      expect(second.warmed).toBe(0);
      expect(second.alreadyCached).toBe(first.warmed);

      const flushed = await warmLocationCache({ flush: true });
      expect(flushed.flushed).toBeGreaterThan(0);
      expect(flushed.warmed).toBe(first.warmed);
    });

    it('does not cache a 404', async () => {
      await request(app).get('/locations-by-slug/no-such-slug').expect(404);
      const res = await request(app).get('/locations-by-slug/no-such-slug').expect(404);
      expect(res.headers['x-cache']).toBeUndefined();
    });
  });
});
