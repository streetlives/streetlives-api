/**
 * @jest-environment node
 */

// Tests for src/services/photo-storage.js - configuration detection, the
// content-addressed key scheme, public URL composition, and the driver
// selection that keeps the AWS SDK out of every other route's cold start.

const PHOTO_ENV = [
  'LOCATION_PHOTO_S3_BUCKET',
  'LOCATION_PHOTO_PUBLIC_BASE_URL',
  'LOCATION_PHOTO_KEY_PREFIX',
  'LOCATION_PHOTO_STORAGE_DRIVER',
  'LOCATION_PHOTO_MAX_BYTES',
];

describe('photo-storage', () => {
  let saved;
  let storage;

  beforeEach(() => {
    saved = {};
    PHOTO_ENV.forEach((key) => { saved[key] = process.env[key]; delete process.env[key]; });
    jest.resetModules();
    storage = require('../../src/services/photo-storage'); // eslint-disable-line global-require
  });

  afterEach(() => {
    PHOTO_ENV.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  describe('isConfigured', () => {
    it('is false with nothing set', () => {
      expect(storage.isConfigured()).toBe(false);
    });

    it('is false with a bucket but no public base URL', () => {
      // A bucket with no CDN domain would store objects nobody can read.
      process.env.LOCATION_PHOTO_S3_BUCKET = 'a-bucket';
      expect(storage.isConfigured()).toBe(false);
    });

    it('is false with a public base URL but no bucket', () => {
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example';
      expect(storage.isConfigured()).toBe(false);
    });

    it('is true with both', () => {
      process.env.LOCATION_PHOTO_S3_BUCKET = 'a-bucket';
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example';
      expect(storage.isConfigured()).toBe(true);
    });

    it('is true for the memory driver with a base URL and no bucket', () => {
      process.env.LOCATION_PHOTO_STORAGE_DRIVER = 'memory';
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://photos.test.invalid';
      expect(storage.isConfigured()).toBe(true);
    });
  });

  describe('buildObjectKey', () => {
    const base = { locationId: 'loc-1', sha256: 'deadbeef' };

    it.each([
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
    ])('uses the extension for %s', (contentType, extension) => {
      expect(storage.buildObjectKey({ ...base, contentType }))
        .toBe(`location-photos/loc-1/deadbeef.${extension}`);
    });

    it('honours a configured key prefix', () => {
      process.env.LOCATION_PHOTO_KEY_PREFIX = 'custom/prefix';
      expect(storage.buildObjectKey({ ...base, contentType: 'image/png' }))
        .toBe('custom/prefix/loc-1/deadbeef.png');
    });

    it('rejects an unsupported content type', () => {
      expect(() => storage.buildObjectKey({ ...base, contentType: 'image/svg+xml' }))
        .toThrow(/Unsupported content type/);
    });

    it('is stable for identical bytes and different for different bytes', () => {
      const one = storage.hashPhoto(Buffer.from('same'));
      const two = storage.hashPhoto(Buffer.from('same'));
      const other = storage.hashPhoto(Buffer.from('different'));
      expect(one).toBe(two);
      expect(one).not.toBe(other);
    });
  });

  describe('buildPublicUrl', () => {
    it('returns null when no base URL is configured', () => {
      expect(storage.buildPublicUrl('some/key.jpg')).toBeNull();
    });

    it('returns null for a missing key', () => {
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example';
      expect(storage.buildPublicUrl(null)).toBeNull();
    });

    it('joins the base URL and key', () => {
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example';
      expect(storage.buildPublicUrl('a/b.jpg')).toBe('https://cdn.example/a/b.jpg');
    });

    it('strips trailing slashes from the base URL', () => {
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example///';
      expect(storage.buildPublicUrl('a/b.jpg')).toBe('https://cdn.example/a/b.jpg');
    });
  });

  describe('when storage is unconfigured', () => {
    it('putPhoto throws PhotoStorageUnavailableError', async () => {
      await expect(storage.putPhoto({ key: 'k', body: Buffer.from('x') }))
        .rejects.toThrow(storage.PhotoStorageUnavailableError);
    });

    it('deletePhoto is a silent no-op', async () => {
      await expect(storage.deletePhoto('k')).resolves.toBeUndefined();
    });
  });

  describe('memory driver', () => {
    beforeEach(() => {
      process.env.LOCATION_PHOTO_STORAGE_DRIVER = 'memory';
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://photos.test.invalid';
    });

    it('round-trips put, get and delete', async () => {
      /* eslint-disable global-require */
      const memory = require('../../src/services/photo-storage-memory');
      /* eslint-enable global-require */
      memory.reset();

      await storage.putPhoto({
        key: 'k.jpg', body: Buffer.from('bytes'), contentType: 'image/jpeg',
      });
      expect(memory.getPhoto('k.jpg').body.toString()).toBe('bytes');

      await storage.deletePhoto('k.jpg');
      expect(memory.getPhoto('k.jpg')).toBeNull();
    });

    it('does not throw when deleting a key that is not there', async () => {
      await expect(storage.deletePhoto('missing.jpg')).resolves.toBeUndefined();
    });
  });

  describe('lazy SDK loading', () => {
    const { sep } = require('path'); // eslint-disable-line global-require
    const sdkLoaded = () =>
      Object.keys(require.cache).some(k => k.includes(`@aws-sdk${sep}client-s3`));

    it('never loads @aws-sdk/client-s3 for the memory or none drivers', async () => {
      expect(sdkLoaded()).toBe(false);

      // none
      await storage.deletePhoto('k');
      await expect(storage.putPhoto({ key: 'k', body: Buffer.from('x') })).rejects.toThrow();

      // memory
      process.env.LOCATION_PHOTO_STORAGE_DRIVER = 'memory';
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://photos.test.invalid';
      await storage.putPhoto({
        key: 'k.jpg', body: Buffer.from('x'), contentType: 'image/jpeg',
      });

      // The SDK is several megabytes to parse. Loading it here would put that
      // on the cold start of every route, not just the photo endpoints.
      expect(sdkLoaded()).toBe(false);
    });
  });
});
