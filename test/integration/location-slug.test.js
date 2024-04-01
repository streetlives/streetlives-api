/**
 * @jest-environment node
 */

import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';

describe('get location info', () => {
  let organization;
  let primaryLocation;
  let hiddenLocation;
  let otherServiceLocation;
  let farLocation;
  const pointNearOrigin = geometry.createPoint(-73.991303, 40.751908);
  const pointSlightlyFurtherFromOrigin = geometry.createPoint(-73.991304, 40.751907);
  const pointFarFromOrigin = geometry.createPoint(-73.951042, 40.718576);

  const physicalAddress1 = {
    address_1: '123 W 50th St.',
    city: 'New York',
    state_province: 'NY',
    postal_code: '10001',
    country: 'US',
  };

  const physicalAddress2 = {
    address_1: '222 E 75th St.',
    city: 'New York',
    state_province: 'NY',
    postal_code: '10002',
    country: 'US',
  };

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const setupData = async () => {
    organization = await models.Organization.create({
      name: 'The Test Org',
      description: 'An organization meant for testing purposes.',
    });

    primaryLocation = await organization.createLocation(
      {
        name: 'Nearby center',
        position: pointNearOrigin,
        PhysicalAddresses: [physicalAddress1],
      },
      {
        include: [
          models.PhysicalAddress,
        ],
      },
    );

    // we introduce some delays so that the subsequent sort of locations
    // while updating the organization name works deterministically
    await delay(100);

    hiddenLocation = await organization.createLocation(
      {
        name: 'Nearby center (volunteers)',
        position: pointNearOrigin,
        PhysicalAddresses: [{
          address_1: '222 E 75th St.',
          city: 'New York',
          state_province: 'NY',
          postal_code: '10002',
          country: 'US',
        }],
      },
      {
        include: [
          models.PhysicalAddress,
        ],
      },
    );

    await delay(100);

    otherServiceLocation = await organization.createLocation(
      {
        name: 'Other nearby center',
        position: pointSlightlyFurtherFromOrigin,
      },
      {
        include: [
          models.PhysicalAddress,
        ],
      },
    );

    await delay(100);

    farLocation = await organization.createLocation(
      { name: 'Far-off center', position: pointFarFromOrigin },
      {
        include: [
          models.PhysicalAddress,
        ],
      },
    );
  };

  beforeAll(setupData);

  it('should generate slug at location 1', async () => {
    const slug = 'the-test-org-chelsea';
    await request(app)
      .get(`/locations/${primaryLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(primaryLocation.id);
      });
  });

  it('should generate slug at location 2', async () => {
    const slug = 'the-test-org-lower-east-side';
    await request(app)
      .get(`/locations/${hiddenLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(hiddenLocation.id);
      });
  });

  // these locations  do not have addresses
  it('should generate slug at location 3', () =>
    request(app)
      .get(`/locations/${otherServiceLocation.id}`)
      .expect(500));

  it('should generate slug at location 4', () =>
    request(app)
      .get(`/locations/${farLocation.id}`)
      .expect(500));

  // add a physcial_address to first one - should have an address suffix
  it('should generate slug at location 3 after adding physical address', async () => {
    const slug = 'the-test-org-chelsea-123-w-50th-st';
    await otherServiceLocation.createPhysicalAddress(physicalAddress1);
    await request(app)
      .get(`/locations/${otherServiceLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(otherServiceLocation.id);
      });
  });

  // add a physcial_address to second one - should have an address suffix, plus a count suffix
  it('should generate slug at location 4 after adding physical address', async () => {
    const slug = 'the-test-org-chelsea-123-w-50th-st-2';
    await farLocation.createPhysicalAddress(physicalAddress1);
    await request(app)
      .get(`/locations/${farLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(farLocation.id);
      });
  });

  // update the address at the first location
  // it should have an address suffix to avoid conflict with location 2
  it('should generate slug at location 1 after updating physical address', async () => {
    const { slug: oldSlug } = await models.Location.findByPk(primaryLocation.id);
    const slug = 'the-test-org-lower-east-side-222-e-75th-st';
    const address = primaryLocation.PhysicalAddresses[0];
    address.set('address_1', physicalAddress2.address_1);
    address.set('postal_code', physicalAddress2.postal_code);
    await address.save();
    await request(app)
      .get(`/locations/${primaryLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(primaryLocation.id);
      });
    await request(app)
      .get(`/locations-slug-redirects/${oldSlug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(primaryLocation.id);
        expect(res.body.slug).toEqual(slug);
      });
  });

  // update the address at the third location
  // it should have an address suffix AND a count suffix to avoid conflict with locations 1 and 2
  it('should generate slug at location 3 after updating physical address', async () => {
    const slug = 'the-test-org-lower-east-side-222-e-75th-st-2';
    const otherServiceLocationReloaded = await models.Location.findByPk(otherServiceLocation.id, {
      include: {
        model: models.PhysicalAddress,
      },
    });
    const address = otherServiceLocationReloaded.PhysicalAddresses[0];
    address.set('address_1', physicalAddress2.address_1);
    address.set('postal_code', physicalAddress2.postal_code);
    await address.save();
    await request(app)
      .get(`/locations/${otherServiceLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(otherServiceLocation.id);
      });
  });

  // update the address at the third location
  // it should have an address suffix AND a count suffix to avoid conflict with locations 1, 2 and 3
  it('should generate slug at location 4 after updating physical address', async () => {
    const slug = 'the-test-org-lower-east-side-222-e-75th-st-3';
    const farLocationReloaded = await models.Location.findByPk(farLocation.id, {
      include: {
        model: models.PhysicalAddress,
      },
    });
    const address = farLocationReloaded.PhysicalAddresses[0];
    address.set('address_1', physicalAddress2.address_1);
    address.set('postal_code', physicalAddress2.postal_code);
    await address.save();
    await request(app)
      .get(`/locations/${farLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(slug);
      });
    await request(app)
      .get(`/locations-by-slug/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(farLocation.id);
      });
  });

  // update organization name - should update both location slugs
  it('should generate slugs at all four locations after updating organization name', async () => {
    const { slug: primaryLocationOldSlug } = await models.Location.findByPk(primaryLocation.id);
    const { slug: hiddenLocationOldSlug } = await models.Location.findByPk(hiddenLocation.id);
    const { slug: otherServiceLocationOldSlug } =
      await models.Location.findByPk(otherServiceLocation.id);
    const { slug: farLocationOldSlug } = await models.Location.findByPk(farLocation.id);

    const primaryLocationNewSlug = 'the-new-test-org-lower-east-side';
    const hiddenLocationNewSlug = 'the-new-test-org-lower-east-side-222-e-75th-st';
    const otherServiceLocationNewSlug = 'the-new-test-org-lower-east-side-222-e-75th-st-2';
    const farLocationNewSlug = 'the-new-test-org-lower-east-side-222-e-75th-st-3';

    organization.set('name', 'The New Test Org');
    await organization.save();

    await request(app)
      .get(`/locations/${primaryLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual(primaryLocationNewSlug);
      });
    await request(app)
      .get(`/locations-slug-redirects/${primaryLocationOldSlug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(primaryLocation.id);
        expect(res.body.slug).toEqual(primaryLocationNewSlug);
      });

    await request(app)
      .get(`/locations/${hiddenLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual('the-new-test-org-lower-east-side-222-e-75th-st');
      });
    await request(app)
      .get(`/locations-slug-redirects/${hiddenLocationOldSlug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(hiddenLocation.id);
        expect(res.body.slug).toEqual(hiddenLocationNewSlug);
      });

    await request(app)
      .get(`/locations/${otherServiceLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual('the-new-test-org-lower-east-side-222-e-75th-st-2');
      });
    await request(app)
      .get(`/locations-slug-redirects/${otherServiceLocationOldSlug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(otherServiceLocation.id);
        expect(res.body.slug).toEqual(otherServiceLocationNewSlug);
      });

    await request(app)
      .get(`/locations/${farLocation.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body.slug).toEqual('the-new-test-org-lower-east-side-222-e-75th-st-3');
      });
    await request(app)
      .get(`/locations-slug-redirects/${farLocationOldSlug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.id).toEqual(farLocation.id);
        expect(res.body.slug).toEqual(farLocationNewSlug);
      });
  });

  // TODO: test delete on location
});

