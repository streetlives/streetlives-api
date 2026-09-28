/**
 * @jest-environment node
 */

import zlib from 'zlib';
import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';
import * as memoryStorage from '../../src/services/photo-storage-memory';
import { PHOTO_MAX_BYTES } from '../../src/controllers/validation/locations';

// Minimal but genuinely valid images: the controller sniffs magic bytes, so a
// fixture of random data would be rejected before reaching any of the
// behaviour under test.
const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([
    length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4),
  ]);
};

const buildPng = (width, height, filler = 0) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(32, filler))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const buildJpeg = (width, height) => {
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(9, 0);
  sof[2] = 8;
  sof.writeUInt16BE(height, 3);
  sof.writeUInt16BE(width, 5);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc0]), sof,
    Buffer.from([0xff, 0xd9]),
  ]);
};

const PNG = buildPng(1600, 1200);
const OTHER_PNG = buildPng(800, 600, 1);
const JPEG = buildJpeg(640, 480);

const pngBody = (overrides = {}) => ({
  contentType: 'image/png',
  data: PNG.toString('base64'),
  ...overrides,
});

describe('location photo', () => {
  let location;

  const setupData = async () => {
    const organization = await models.Organization.create(
      {
        name: 'The Photo Test Org',
        description: 'An organization meant for testing purposes.',
        url: 'www.streetlives.com',
        Locations: [{
          name: 'Some kind of center',
          description: 'This is how one would describe this location.',
          PhysicalAddresses: [{
            address_1: '123 Test Street',
            city: 'New York',
            state_province: 'NY',
            postal_code: '10001',
            country: 'US',
          }],
        }],
      },
      {
        include: [{ model: models.Location, include: [models.PhysicalAddress] }],
      },
    );
    [location] = organization.Locations;
  };

  beforeAll(setupData);

  afterEach(async () => {
    await models.LocationPhoto.destroy({ where: {}, force: true });
    await models.Metadata.destroy({ where: { resource_table: 'location_photos' } });
    memoryStorage.reset();
  });

  const putPhoto = body => request(app).put(`/locations/${location.id}/photo`).send(body);
  const deletePhoto = () => request(app).delete(`/locations/${location.id}/photo`);
  const getPhotoRow = () => models.LocationPhoto.findOne({ where: { location_id: location.id } });

  describe('uploading', () => {
    it('stores the object and records the row', async () => {
      const res = await putPhoto(pngBody({ filename: 'storefront.png' }));

      expect(res.statusCode).toBe(200);

      const row = await getPhotoRow();
      expect(row).not.toBeNull();
      expect(row.content_type).toBe('image/png');
      expect(row.byte_size).toBe(PNG.length);
      expect(row.original_filename).toBe('storefront.png');

      expect(memoryStorage.getPhoto(row.s3_key).body.equals(PNG)).toBe(true);
    });

    it('derives the dimensions from the image rather than trusting the client', async () => {
      await putPhoto(pngBody({ width: 1, height: 1 }));

      const row = await getPhotoRow();
      expect(row.width).toBe(1600);
      expect(row.height).toBe(1200);
    });

    it('returns the public URL and omits the operational columns', async () => {
      const res = await putPhoto(pngBody());

      const row = await getPhotoRow();
      expect(res.body.url).toBe(`https://photos.test.invalid/${row.s3_key}`);
      expect(res.body).not.toHaveProperty('s3_bucket');
      expect(res.body).not.toHaveProperty('sha256');
      expect(res.body).not.toHaveProperty('location_id');
    });

    it('puts the content digest in the key so a replacement busts the CDN cache', async () => {
      await putPhoto(pngBody());
      const row = await getPhotoRow();

      const keyPattern = new RegExp(`^location-photos/${location.id}/[0-9a-f]{64}\\.png$`);
      expect(row.s3_key).toMatch(keyPattern);
      expect(row.s3_key).toContain(row.sha256);
    });

    it('accepts a JPEG', async () => {
      const res = await putPhoto({ contentType: 'image/jpeg', data: JPEG.toString('base64') });

      expect(res.statusCode).toBe(200);
      expect((await getPhotoRow()).content_type).toBe('image/jpeg');
    });
  });

  describe('replacing', () => {
    it('keeps one row and removes the superseded object', async () => {
      await putPhoto(pngBody());
      const first = await getPhotoRow();

      await putPhoto({ contentType: 'image/png', data: OTHER_PNG.toString('base64') });
      const second = await getPhotoRow();

      expect(await models.LocationPhoto.count({ where: { location_id: location.id } })).toBe(1);
      expect(second.s3_key).not.toBe(first.s3_key);
      expect(memoryStorage.getPhoto(first.s3_key)).toBeNull();
      expect(memoryStorage.getPhoto(second.s3_key)).not.toBeNull();
    });

    it('keeps the object when the same bytes are uploaded again', async () => {
      // Identical bytes produce an identical key. Deleting the "previous"
      // object here would delete the one the surviving row points at, leaving
      // a row whose URL 404s.
      await putPhoto(pngBody());
      const first = await getPhotoRow();

      const res = await putPhoto(pngBody());
      const second = await getPhotoRow();

      expect(res.statusCode).toBe(200);
      expect(second.s3_key).toBe(first.s3_key);
      expect(memoryStorage.getPhoto(first.s3_key)).not.toBeNull();
    });
  });

  describe('deleting', () => {
    it('removes the row and the object', async () => {
      await putPhoto(pngBody());
      const row = await getPhotoRow();

      const res = await deletePhoto();

      expect(res.statusCode).toBe(204);
      expect(await getPhotoRow()).toBeNull();
      expect(memoryStorage.getPhoto(row.s3_key)).toBeNull();
    });

    it('is idempotent when there is no photo', async () => {
      const res = await deletePhoto();

      expect(res.statusCode).toBe(204);
    });
  });

  describe('isolation from the streetview override', () => {
    // The whole reason the photo is its own table: streetlives-web collapses an
    // all-null streetview payload to null to delete the override row, so a
    // column on `streetviews` would make clearing an override destroy the photo.
    it('survives clearing the streetview override', async () => {
      await putPhoto(pngBody());

      const res = await request(app)
        .patch(`/locations/${location.id}`)
        .send({ streetview: null });

      expect(res.statusCode).toBe(204);
      expect(await getPhotoRow()).not.toBeNull();
    });

    it('survives an unrelated location update', async () => {
      await putPhoto(pngBody());

      await request(app).patch(`/locations/${location.id}`).send({ name: 'Renamed center' });

      expect(await getPhotoRow()).not.toBeNull();
    });
  });

  describe('response inclusion', () => {
    it('appears on the location detail endpoint', async () => {
      await putPhoto(pngBody());
      const row = await getPhotoRow();

      const res = await request(app).get(`/locations/${location.id}`);

      expect(res.body.LocationPhoto.url).toBe(`https://photos.test.invalid/${row.s3_key}`);
    });

    // `url` is the portable representation. The bucket, key and digest are how
    // this deployment happens to store the file, and publishing them ties
    // consumers - and any HSDS export built on this payload - to one vendor's
    // object layout. s3_key is the easy one to regress: the virtual `url`
    // declares it as a dependency, so sequelize puts it back into any SELECT
    // that tries to exclude it.
    it.each([
      ['the upload response', async () => (await putPhoto(pngBody())).body],
      ['the detail endpoint', async () => {
        await putPhoto(pngBody());
        return (await request(app).get(`/locations/${location.id}`)).body.LocationPhoto;
      }],
      ['the by-slug endpoint', async () => {
        await putPhoto(pngBody());
        const fresh = await models.Location.findByPk(location.id);
        return (await request(app).get(`/locations-by-slug/${fresh.slug}`)).body.LocationPhoto;
      }],
    ])('keeps storage internals out of %s', async (_label, fetchPhoto) => {
      const photo = await fetchPhoto();

      expect(photo.url).toEqual(expect.stringContaining('https://photos.test.invalid/'));
      ['s3_key', 's3_bucket', 'sha256', 'location_id'].forEach((field) => {
        expect(photo).not.toHaveProperty(field);
      });
    });

    it('appears on the by-slug endpoint', async () => {
      await putPhoto(pngBody());
      const fresh = await models.Location.findByPk(location.id);

      const res = await request(app).get(`/locations-by-slug/${fresh.slug}`);

      expect(res.body.LocationPhoto).not.toBeNull();
      expect(res.body.LocationPhoto.content_type).toBe('image/png');
    });

    it('is null when the location has no photo', async () => {
      const res = await request(app).get(`/locations/${location.id}`);

      expect(res.body.LocationPhoto).toBeNull();
    });
  });

  describe('last-updated metadata', () => {
    const getPhotoEntry = async () => {
      const res = await request(app).get(`/locations/${location.id}`);
      return res.body.metadata.location.find(entry => entry.field_name === 'photo');
    };

    it('is absent before any upload', async () => {
      expect(await getPhotoEntry()).toBeUndefined();
    });

    it('appears after an upload and advances on replacement', async () => {
      await putPhoto(pngBody());
      const first = await getPhotoEntry();
      expect(first).toBeDefined();

      await putPhoto({ contentType: 'image/png', data: OTHER_PNG.toString('base64') });
      const second = await getPhotoEntry();

      expect(new Date(second.last_action_date).getTime())
        .toBeGreaterThanOrEqual(new Date(first.last_action_date).getTime());
    });

    it('goes back to unset once the photo is removed', async () => {
      await putPhoto(pngBody());
      await deletePhoto();

      expect(await getPhotoEntry()).toBeUndefined();
    });
  });

  describe('audit trail', () => {
    const photoMetadata = () => models.Metadata.findAll({
      where: { resource_table: 'location_photos' },
    });

    it('records a create with the fields that identify the object', async () => {
      await putPhoto(pngBody());

      const rows = await photoMetadata();
      const fields = rows.map(r => r.field_name);

      expect(rows.every(r => r.last_action_type === 'create')).toBe(true);
      expect(fields).toEqual(expect.arrayContaining(['s3_key', 'content_type', 'byte_size']));
    });

    it('records an update with the previous and replacement values', async () => {
      await putPhoto(pngBody());
      const first = await getPhotoRow();
      await putPhoto({ contentType: 'image/png', data: OTHER_PNG.toString('base64') });

      const updates = (await photoMetadata())
        .filter(r => r.last_action_type === 'update' && r.field_name === 's3_key');

      expect(updates).toHaveLength(1);
      expect(updates[0].previous_value).toBe(first.s3_key);
    });

    it('records a delete', async () => {
      await putPhoto(pngBody());
      await deletePhoto();

      const deletes = (await photoMetadata()).filter(r => r.last_action_type === 'delete');
      expect(deletes.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it.each([
      ['no data', { contentType: 'image/png' }],
      ['no content type', { data: PNG.toString('base64') }],
      ['an SVG content type', { contentType: 'image/svg+xml', data: PNG.toString('base64') }],
      ['a PDF content type', { contentType: 'application/pdf', data: PNG.toString('base64') }],
      ['data that is not base64', { contentType: 'image/png', data: 'not base64!!' }],
      ['unpadded base64', { contentType: 'image/png', data: 'YWJj'.slice(0, 3) }],
      ['empty data', { contentType: 'image/png', data: '' }],
      ['a declared type that does not match the bytes', {
        contentType: 'image/png', data: JPEG.toString('base64'),
      }],
      ['base64 of a PDF', {
        contentType: 'image/png', data: Buffer.from('%PDF-1.7\nxxxx').toString('base64'),
      }],
      ['base64 of an SVG', {
        contentType: 'image/png',
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
      }],
      ['an over-long filename', {
        contentType: 'image/png', data: PNG.toString('base64'), filename: 'x'.repeat(256),
      }],
    ])('rejects %s without writing anything', async (_label, body) => {
      const res = await putPhoto(body);

      expect(res.statusCode).toBe(400);
      expect(await getPhotoRow()).toBeNull();
      expect(memoryStorage.listKeys()).toHaveLength(0);
    });

    it('rejects an image over the byte cap', async () => {
      const oversized = Buffer.concat([PNG, Buffer.alloc(PHOTO_MAX_BYTES)]);

      const res = await putPhoto({
        contentType: 'image/png', data: oversized.toString('base64'),
      });

      expect(res.statusCode).toBe(400);
      expect(await getPhotoRow()).toBeNull();
    });

    it('rejects a malformed location id', async () => {
      const res = await request(app).put('/locations/not-a-uuid/photo').send(pngBody());

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown location', async () => {
      const res = await request(app)
        .put('/locations/11111111-1111-1111-1111-111111111111/photo')
        .send(pngBody());

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when deleting for an unknown location', async () => {
      const res = await request(app)
        .delete('/locations/11111111-1111-1111-1111-111111111111/photo');

      expect(res.statusCode).toBe(404);
    });
  });

  describe('request size limits', () => {
    it('answers 413 rather than 500 for a body over the parser limit', async () => {
      const huge = Buffer.alloc(7 * 1024 * 1024, 0x41).toString('base64');

      const res = await putPhoto({ contentType: 'image/png', data: huge });

      expect(res.statusCode).toBe(413);
    });

    it('keeps the 100KB default on other routes', async () => {
      // The raised limit is scoped to the upload path. If someone "simplifies"
      // app.js by lifting it globally, this is what catches it.
      const res = await request(app)
        .patch(`/locations/${location.id}`)
        .send({ description: 'x'.repeat(200 * 1024) });

      expect(res.statusCode).toBe(413);
    });
  });

  describe('failure handling', () => {
    it('writes no row when the object store rejects the write', async () => {
      memoryStorage.failNextPutWith(new Error('S3 is having a day'));

      const res = await putPhoto(pngBody());

      expect(res.statusCode).toBe(500);
      expect(await getPhotoRow()).toBeNull();
    });

    it('leaves the object behind when the database write fails', async () => {
      // The accepted trade: S3 is written first, so a rollback orphans an
      // unreferenced object rather than committing a row that points at
      // nothing. An orphan is invisible; a broken image is not.
      const spy = jest.spyOn(models.LocationPhoto, 'create')
        .mockRejectedValueOnce(new Error('database went away'));

      const res = await putPhoto(pngBody());

      expect(res.statusCode).toBe(500);
      expect(await getPhotoRow()).toBeNull();
      expect(memoryStorage.listKeys()).toHaveLength(1);

      spy.mockRestore();
    });
  });

  describe('concurrency', () => {
    it('ends with exactly one row when uploads race', async () => {
      const bodies = [0, 1, 2, 3].map(i => ({
        contentType: 'image/png',
        data: buildPng(100 + i, 100 + i).toString('base64'),
      }));

      const responses = await Promise.all(bodies.map(putPhoto));

      expect(responses.every(r => r.statusCode === 200)).toBe(true);
      expect(await models.LocationPhoto.count({ where: { location_id: location.id } })).toBe(1);
    });
  });

  describe('when storage is not configured', () => {
    let savedDriver;
    let savedBaseUrl;

    beforeEach(() => {
      savedDriver = process.env.LOCATION_PHOTO_STORAGE_DRIVER;
      savedBaseUrl = process.env.LOCATION_PHOTO_PUBLIC_BASE_URL;
      delete process.env.LOCATION_PHOTO_STORAGE_DRIVER;
      delete process.env.LOCATION_PHOTO_PUBLIC_BASE_URL;
    });

    afterEach(() => {
      process.env.LOCATION_PHOTO_STORAGE_DRIVER = savedDriver;
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = savedBaseUrl;
    });

    // This is the contract that lets the API ship before the bucket exists.
    it('answers 503 on upload and writes nothing', async () => {
      const res = await putPhoto(pngBody());

      expect(res.statusCode).toBe(503);
      expect(await getPhotoRow()).toBeNull();
      expect(memoryStorage.listKeys()).toHaveLength(0);
    });

    it('answers 503 on delete', async () => {
      const res = await deletePhoto();

      expect(res.statusCode).toBe(503);
    });

    it('still serves the location, with no photo URL', async () => {
      const res = await request(app).get(`/locations/${location.id}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.LocationPhoto).toBeNull();
    });
  });
});
