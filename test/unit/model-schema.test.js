import { TextDecoder, TextEncoder } from 'util';
import { DataTypes } from 'sequelize';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const models = require('../../src/models');

describe('model definitions match migrated schemas', () => {
  afterAll(async () => {
    await models.sequelize.close();
  });

  it('does not generate UUIDs for CommentLike integer ids', () => {
    const idAttribute = models.CommentLike.rawAttributes.id;

    expect(idAttribute.type.key).toBe(DataTypes.INTEGER.key);
    expect(idAttribute.primaryKey).toBe(true);
    expect(idAttribute.autoIncrement).toBe(true);
    expect(idAttribute.allowNull).toBe(false);
    expect(idAttribute.defaultValue).toBeUndefined();

    const like = models.CommentLike.build({
      comment_id: '00000000-0000-0000-0000-000000000001',
      ip_address: '127.0.0.1',
    });

    expect(like.id).toBeNull();
  });

  it('does not map the removed PhysicalAddress neighborhood column', () => {
    expect(models.PhysicalAddress.rawAttributes.neighborhood).toBeUndefined();
    expect(Object.keys(models.PhysicalAddress.rawAttributes)).not.toContain('neighborhood');
  });

  describe('LocationPhoto', () => {
    // Metadata.associate scopes its hasMany by model.tableName, so the audit
    // trail's resource_table depends on this deriving to location_photos.
    it('derives the location_photos table name', () => {
      expect(models.LocationPhoto.tableName).toBe('location_photos');
    });

    it('allows one photo per location', () => {
      const { location_id: locationId } = models.LocationPhoto.rawAttributes;

      expect(locationId.allowNull).toBe(false);
      expect(locationId.unique).toBe(true);
    });

    it('requires the fields that identify the stored object', () => {
      const attributes = models.LocationPhoto.rawAttributes;

      ['s3_bucket', 's3_key', 'content_type', 'byte_size', 'sha256'].forEach((field) => {
        expect(attributes[field].allowNull).toBe(false);
      });
      ['width', 'height', 'original_filename'].forEach((field) => {
        expect(attributes[field].allowNull).toBe(true);
      });
    });

    it('exposes the public URL as a virtual composed from the key', () => {
      const previous = process.env.LOCATION_PHOTO_PUBLIC_BASE_URL;
      process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = 'https://cdn.example';

      const photo = models.LocationPhoto.build({ s3_key: 'location-photos/a/b.jpg' });

      expect(photo.url).toBe('https://cdn.example/location-photos/a/b.jpg');
      // The virtual has to survive the plain serialization the location
      // response path uses, or the URL never reaches the API consumer.
      expect(photo.get({ plain: true }).url)
        .toBe('https://cdn.example/location-photos/a/b.jpg');

      delete process.env.LOCATION_PHOTO_PUBLIC_BASE_URL;
      expect(photo.url).toBeNull();

      if (previous === undefined) delete process.env.LOCATION_PHOTO_PUBLIC_BASE_URL;
      else process.env.LOCATION_PHOTO_PUBLIC_BASE_URL = previous;
    });

    it('is not stored as a URL, so a restored snapshot cannot leak another CDN', () => {
      expect(models.LocationPhoto.rawAttributes.url.type.key).toBe('VIRTUAL');
      expect(Object.keys(models.LocationPhoto.rawAttributes)).not.toContain('public_url');
    });
  });
});
