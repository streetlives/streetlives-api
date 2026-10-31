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

  describe('HolidaySchedule', () => {
    it('maps the HSDS 3.0 schedule fields', () => {
      const attributes = Object.keys(models.HolidaySchedule.rawAttributes);

      ['freq', 'interval', 'byday', 'bymonthday', 'valid_from', 'valid_to',
        'description'].forEach((field) => {
        expect(attributes).toContain(field);
      });
      // schedule.description holds the street team's notes; HSDS notes is unused.
      expect(attributes).not.toContain('notes');
      // Times are New York time (see the README); HSDS timezone is a fixed UTC offset.
      expect(attributes).not.toContain('timezone');
    });

    it('only accepts HSDS frequencies yourpeer can render', async () => {
      const schedule = models.HolidaySchedule.build({ closed: false, freq: 'DAILY' });

      await expect(schedule.validate()).rejects.toThrow();
    });

    it('only accepts a numbered byday or a bymonthday on monthly rows', async () => {
      const build = fields => models.HolidaySchedule.build({ closed: false, ...fields });

      await expect(build({ freq: 'WEEKLY', byday: '2FR' }).validate()).rejects.toThrow();
      await expect(build({ byday: '-1FR' }).validate()).rejects.toThrow();
      await expect(build({ freq: 'WEEKLY', bymonthday: '15' }).validate()).rejects.toThrow();
      await expect(build({ freq: 'MONTHLY', byday: '2FR' }).validate()).resolves.toBeDefined();
      await expect(build({ freq: 'MONTHLY', bymonthday: '15' }).validate()).resolves.toBeDefined();
      await expect(build({ freq: 'WEEKLY', byday: 'MO,FR' }).validate()).resolves.toBeDefined();
    });

    it('maps the dates a series skips and the months a rule applies in', () => {
      expect(models.HolidaySchedule.rawAttributes.exdates.type.key).toBe(DataTypes.ARRAY.key);
      expect(models.HolidaySchedule.rawAttributes.bymonth.type.key).toBe(DataTypes.TEXT.key);
    });

    it('needs a yearly row to name its months and days', async () => {
      const build = fields => models.HolidaySchedule.build({
        closed: true, freq: 'YEARLY', ...fields,
      });

      await expect(build({ bymonthday: '25' }).validate()).rejects.toThrow();
      await expect(build({ bymonth: '12' }).validate()).rejects.toThrow();
      await expect(build({ bymonth: '12', bymonthday: '25' }).validate()).resolves.toBeDefined();
      await expect(build({ bymonth: '11', byday: '4TH' }).validate()).resolves.toBeDefined();
    });

    it('makes an open weekday row without freq a weekly series', async () => {
      const saturday = models.HolidaySchedule.build({ closed: false, weekday: 6 });
      const sunday = models.HolidaySchedule.build({ closed: false, weekday: 0 });
      const closedSaturday = models.HolidaySchedule.build({ closed: true, weekday: 6 });

      await Promise.all([saturday, sunday, closedSaturday].map(row => row.validate()));

      expect([saturday.freq, saturday.byday]).toEqual(['WEEKLY', 'SA']);
      expect([sunday.freq, sunday.byday]).toEqual(['WEEKLY', 'SU']);
      expect(closedSaturday.freq).toBeFalsy();
    });

    it('makes a one-off without an end date last one day', async () => {
      const oneOff = models.HolidaySchedule.build({ closed: true, valid_from: '2026-12-25' });

      await oneOff.validate();

      expect(oneOff.valid_to).toBe('2026-12-25');
    });

    it('needs a valid_from to count an interval from', async () => {
      const build = fields => models.HolidaySchedule.build({
        closed: false, freq: 'WEEKLY', ...fields,
      });

      await expect(build({ interval: 2 }).validate()).rejects.toThrow();
      await expect(build({ interval: 2, valid_from: '2021-10-31' }).validate())
        .resolves.toBeDefined();
    });

    it('only lets a series skip dates', async () => {
      const build = fields => models.HolidaySchedule.build({ closed: false, ...fields });

      await expect(build({ valid_from: '2026-12-25', exdates: ['2026-12-25'] }).validate())
        .rejects.toThrow();
      await expect(build({ freq: 'WEEKLY', byday: 'SA', exdates: ['2026-11-14'] }).validate())
        .resolves.toBeDefined();
    });
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
