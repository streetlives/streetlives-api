/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';

describe('update location streetview', () => {
  let location;

  const fullStreetview = {
    pano_id: 'test-pano-id',
    lat: 40.748405,
    lng: -73.985663,
    heading: 90.5,
    pitch: -10.25,
    fov: 90,
  };

  const setupData = async () => {
    const organization = await models.Organization.create(
      {
        name: 'The Test Org',
        description: 'An organization meant for testing purposes.',
        url: 'www.streetlives.com',
        Locations: [{
          name: 'Some kind of center',
          description: 'This is how one would describe this location.',
          PhysicalAddresses: [{
            address_1: '123 West 30th Street',
            city: 'New York',
            state_province: 'NY',
            postal_code: '10001',
            country: 'United States',
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
    await models.Streetview.destroy({ where: {}, force: true });
    await models.Metadata.destroy({ where: { resource_table: 'streetviews' } });
  });

  const patchLocation = body => request(app).patch(`/locations/${location.id}`).send(body);

  const getStreetviewRow = () =>
    models.Streetview.findOne({ where: { location_id: location.id } });

  const createStreetviewRow = (values = {}) => models.Streetview.create({
    location_id: location.id,
    ...fullStreetview,
    ...values,
  });

  describe('creating a streetview', () => {
    it('should create a streetview when none exists and respond with 204', async () => {
      await patchLocation({ streetview: fullStreetview }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview).not.toBeNull();
      expect(streetview.pano_id).toEqual(fullStreetview.pano_id);
      expect(Number(streetview.lat)).toEqual(fullStreetview.lat);
      expect(Number(streetview.lng)).toEqual(fullStreetview.lng);
      expect(Number(streetview.heading)).toEqual(fullStreetview.heading);
      expect(Number(streetview.pitch)).toEqual(fullStreetview.pitch);
      expect(streetview.fov).toEqual(fullStreetview.fov);
    });

    it('should set fields not included in the request to null', async () => {
      await patchLocation({ streetview: { pano_id: 'only-pano' } }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview.pano_id).toEqual('only-pano');
      expect(streetview.lat).toBeNull();
      expect(streetview.lng).toBeNull();
      expect(streetview.heading).toBeNull();
      expect(streetview.pitch).toBeNull();
      expect(streetview.fov).toBeNull();
    });

    it('should write create-audit metadata for the new streetview', async () => {
      const source = 'streetview-test-source';

      await patchLocation({ streetview: fullStreetview, metadata: { source } }).expect(204);

      const streetview = await getStreetviewRow();
      const metadata = await models.Metadata.findAll({
        where: { resource_id: streetview.id },
      });

      expect(metadata.length).toBeGreaterThan(0);
      metadata.forEach((metadataEntry) => {
        expect(metadataEntry.resource_table).toEqual('streetviews');
        expect(metadataEntry.last_action_type).toEqual(models.Metadata.actionTypes.create);
        expect(metadataEntry.source).toEqual(source);
      });

      const auditedFields = metadata.map(({ field_name: fieldName }) => fieldName);
      expect(auditedFields).toEqual(expect.arrayContaining(['pano_id', 'fov']));
    });
  });

  describe('updating an existing streetview', () => {
    beforeEach(() => createStreetviewRow());

    it('should update only the fields included in the request', async () => {
      await patchLocation({ streetview: { heading: 180, fov: 45 } }).expect(204);

      const streetview = await getStreetviewRow();
      expect(Number(streetview.heading)).toEqual(180);
      expect(streetview.fov).toEqual(45);
      expect(streetview.pano_id).toEqual(fullStreetview.pano_id);
      expect(Number(streetview.lat)).toEqual(fullStreetview.lat);
      expect(Number(streetview.lng)).toEqual(fullStreetview.lng);
      expect(Number(streetview.pitch)).toEqual(fullStreetview.pitch);
    });

    it('should not create a second streetview for the same location', async () => {
      await patchLocation({ streetview: { heading: 180 } }).expect(204);

      const streetviewCount = await models.Streetview.count({
        where: { location_id: location.id },
      });
      expect(streetviewCount).toEqual(1);
    });

    it('should allow clearing individual fields by passing null', async () => {
      await patchLocation({ streetview: { pano_id: null, fov: null } }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview.pano_id).toBeNull();
      expect(streetview.fov).toBeNull();
      expect(Number(streetview.lat)).toEqual(fullStreetview.lat);
    });

    it('should write update-audit metadata with previous and replacement values', async () => {
      await patchLocation({ streetview: { fov: 45 } }).expect(204);

      const streetview = await getStreetviewRow();
      const metadata = await models.Metadata.findOne({
        where: {
          resource_id: streetview.id,
          field_name: 'fov',
          last_action_type: models.Metadata.actionTypes.update,
        },
      });

      expect(metadata).not.toBeNull();
      expect(metadata.previous_value).toEqual(`${fullStreetview.fov}`);
      expect(metadata.replacement_value).toEqual('45');
    });
  });

  describe('deleting a streetview by passing null', () => {
    it('should delete an existing streetview and respond with 204', async () => {
      await createStreetviewRow();

      await patchLocation({ streetview: null }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview).toBeNull();
    });

    it('should write delete-audit metadata for the removed streetview', async () => {
      const existing = await createStreetviewRow();

      await patchLocation({ streetview: null }).expect(204);

      const metadata = await models.Metadata.findOne({
        where: {
          resource_id: existing.id,
          last_action_type: models.Metadata.actionTypes.delete,
        },
      });
      expect(metadata).not.toBeNull();
    });

    it('should respond with 204 when no streetview exists', async () => {
      await patchLocation({ streetview: null }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview).toBeNull();
    });
  });

  describe('leaving the streetview alone', () => {
    it('should not touch an existing streetview when the field is omitted', async () => {
      await createStreetviewRow();

      await patchLocation({ name: 'A new name' }).expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview).not.toBeNull();
      expect(streetview.pano_id).toEqual(fullStreetview.pano_id);
    });
  });

  describe('response inclusion', () => {
    it('should include the streetview in the location info response', async () => {
      await createStreetviewRow();

      const res = await request(app).get(`/locations/${location.id}`).expect(200);

      expect(res.body.Streetview).toBeTruthy();
      expect(res.body.Streetview.pano_id).toEqual(fullStreetview.pano_id);
      expect(Number(res.body.Streetview.lat)).toEqual(fullStreetview.lat);
      expect(Number(res.body.Streetview.lng)).toEqual(fullStreetview.lng);
      expect(res.body.Streetview.fov).toEqual(fullStreetview.fov);
    });

    it('should include a null streetview when the location has none', async () => {
      const res = await request(app).get(`/locations/${location.id}`).expect(200);

      expect(res.body.Streetview).toBeNull();
    });
  });

  describe('validation', () => {
    const invalidStreetviews = [
      ['lat above 90', { lat: 90.1 }],
      ['lat below -90', { lat: -90.1 }],
      ['lng above 180', { lng: 180.1 }],
      ['lng below -180', { lng: -180.1 }],
      ['heading above 360', { heading: 360.1 }],
      ['heading below 0', { heading: -1 }],
      ['pitch above 90', { pitch: 90.1 }],
      ['pitch below -90', { pitch: -90.1 }],
      ['fov above 120', { fov: 121 }],
      ['fov below 10', { fov: 9 }],
      ['non-integer fov', { fov: 90.5 }],
      ['pano_id longer than 128 characters', { pano_id: 'x'.repeat(129) }],
      ['non-object streetview', 'not-an-object'],
    ];

    it.each(invalidStreetviews)(
      'should respond with 400 and not write anything for %s',
      async (description, streetview) => {
        await patchLocation({ streetview }).expect(400);

        const streetviewRow = await getStreetviewRow();
        expect(streetviewRow).toBeNull();
      },
    );

    it('should ignore unknown streetview fields (validated with allowUnknown)', async () => {
      await patchLocation({ streetview: { pano_id: 'known-field', bogus_field: 'value' } })
        .expect(204);

      const streetview = await getStreetviewRow();
      expect(streetview.pano_id).toEqual('known-field');
    });

    it('should respond with 404 when the location doesn\'t exist', () => {
      const nonExistentLocationId = '11111111-1111-1111-1111-111111111111';

      return request(app)
        .patch(`/locations/${nonExistentLocationId}`)
        .send({ streetview: fullStreetview })
        .expect(404);
    });
  });

  describe('transaction rollback', () => {
    const nonExistentOrganizationId = '22222222-2222-2222-2222-222222222222';

    it('should roll back a streetview creation when another update fails', async () => {
      await patchLocation({
        streetview: fullStreetview,
        organizationId: nonExistentOrganizationId,
      }).expect(500);

      const streetview = await getStreetviewRow();
      expect(streetview).toBeNull();
    });

    it('should roll back a streetview deletion when another update fails', async () => {
      await createStreetviewRow();

      await patchLocation({
        streetview: null,
        organizationId: nonExistentOrganizationId,
      }).expect(500);

      const streetview = await getStreetviewRow();
      expect(streetview).not.toBeNull();
      expect(streetview.pano_id).toEqual(fullStreetview.pano_id);
    });

    it('should roll back a streetview update when another update fails', async () => {
      await createStreetviewRow();

      await patchLocation({
        streetview: { fov: 45 },
        organizationId: nonExistentOrganizationId,
      }).expect(500);

      const streetview = await getStreetviewRow();
      expect(streetview.fov).toEqual(fullStreetview.fov);
    });
  });
});
