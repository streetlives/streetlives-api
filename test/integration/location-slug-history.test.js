/** @jest-environment node */
import request from 'supertest';
import app from '../../src/app';
import models from '../../src/models';
import geometry from '../../src/utils/geometry';

const geoMigration =
  require('../../sequelize/migrations/20240530015650-update-everything-to-use-geoqueries');
const migration =
  require('../../sequelize/migrations/20261015120000-preserve-location-slug-history');

describe('durable location slug history', () => {
  const queryInterface = models.sequelize.getQueryInterface();
  const firstPosition = geometry.createPoint(-74.5, 40.5);
  const secondPosition = geometry.createPoint(-73.5, 40.5);

  const createLocation = (organization, address = '123 Main St') => organization.createLocation({
    name: 'A location',
    position: firstPosition,
    PhysicalAddresses: [{
      address_1: address,
      city: 'New York',
      state_province: 'NY',
      country: 'US',
      postal_code: '10001',
    }],
  }, { include: [models.PhysicalAddress] });

  const currentSlug = async location => (await location.reload()).slug;
  const expectRedirect = async (slug, location) => {
    const response = await request(app).get(`/location-slug-redirects/${slug}`).expect(200);
    expect(response.body).toEqual({ id: location.id, slug: await currentSlug(location) });
  };

  beforeAll(async () => {
    await models.sequelize.query(`
      INSERT INTO nyc_neighborhood_geometries
        (neighborhood, borough, geometry, created_at, updated_at)
      VALUES ('First Neighborhood', 'Manhattan',
        ST_GeomFromText('POLYGON((-75 40,-74 40,-74 41,-75 41,-75 40))',4326), NOW(), NOW()),
        ('Second Neighborhood', 'Manhattan',
        ST_GeomFromText('POLYGON((-74 40,-73 40,-73 41,-74 41,-74 40))',4326), NOW(), NOW());
      INSERT INTO nyc_districts (district_id, geometry, type, created_at, updated_at)
      SELECT '1', ST_Multi(ST_GeomFromText(
        'POLYGON((-75 40,-73 40,-73 41,-75 41,-75 40))',4326)), type, NOW(), NOW()
      FROM unnest(enum_range(NULL::enum_nyc_districts_type)) AS type;
    `);
    // Exercise the production geocoded get_slug, rather than the old ZIP-based
    // function installed by the shared integration setup.
    await geoMigration.up(queryInterface, models.Sequelize);
    await migration.up(queryInterface);
  });

  it('redirects all former slugs to the latest slug after moves and renames', async () => {
    const organization = await models.Organization.create({ name: 'History Org' });
    const location = await createLocation(organization);
    const firstSlug = await currentSlug(location);
    expect(firstSlug).toBe('history-org-first-neighborhood');
    await location.update({ position: secondPosition });
    const secondSlug = await currentSlug(location);
    expect(secondSlug).toBe('history-org-second-neighborhood');
    await organization.update({ name: 'Renamed History Org' });
    expect(await currentSlug(location)).toBe('renamed-history-org-second-neighborhood');
    await expectRedirect(firstSlug, location);
    await expectRedirect(secondSlug, location);
  });

  it('refreshes organization reassignment without changing the slug naming scheme', async () => {
    const firstOrg = await models.Organization.create({ name: 'Original Owner' });
    const secondOrg = await models.Organization.create({ name: 'New Owner' });
    const location = await createLocation(firstOrg);
    const oldSlug = await currentSlug(location);
    await location.update({ organization_id: secondOrg.id });
    expect(await currentSlug(location)).toBe('new-owner-first-neighborhood');
    await expectRedirect(oldSlug, location);
  });

  it('preserves aliases through a null slug and resumes redirects when restored', async () => {
    const organization = await models.Organization.create({ name: 'Null Slug Org' });
    const location = await createLocation(organization);
    const oldSlug = await currentSlug(location);
    await location.update({ slug: null });
    expect(await models.LocationSlugRedirect.findByPk(oldSlug)).not.toBeNull();
    await request(app).get(`/location-slug-redirects/${oldSlug}`).expect(404);
    await location.update({ slug: 'restored-location-slug' });
    await expectRedirect(oldSlug, location);
  });

  it('refreshes null organization assignments and changed address suffixes', async () => {
    const originalOrg = await models.Organization.create({ name: 'Old Assignment' });
    const organization = await models.Organization.create({ name: 'Previously Unassigned' });
    const location = await createLocation(originalOrg);
    await location.update({ organization_id: null });
    await location.update({ organization_id: organization.id });
    expect(await currentSlug(location)).toBe('previously-unassigned-first-neighborhood');

    const secondLocation = await createLocation(organization, '');
    const oldSlug = await currentSlug(secondLocation);
    expect(oldSlug).toBe('previously-unassigned-first-neighborhood-2');
    const [address] = await secondLocation.getPhysicalAddresses();
    await address.update({ address_1: '456 Main St' });
    expect(await currentSlug(secondLocation))
      .toBe('previously-unassigned-first-neighborhood-456-main-st');
    await expectRedirect(oldSlug, secondLocation);
  });

  it('reserves old slugs for their location and lets their owner reclaim them', async () => {
    const organization = await models.Organization.create({ name: 'Reserved Name' });
    const location = await createLocation(organization);
    const reservedSlug = await currentSlug(location);
    await organization.update({ name: 'New Reserved Name' });

    const otherOrg = await models.Organization.create({ name: 'Reserved Name' });
    const otherLocation = await createLocation(otherOrg);
    expect(await currentSlug(otherLocation)).not.toBe(reservedSlug);
    await expect(otherLocation.update({ slug: reservedSlug }))
      .rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    await organization.update({ name: 'Reserved Name' });
    expect(await currentSlug(location)).toBe(reservedSlug);
  });

  it('allows only one location to claim a new slug concurrently', async () => {
    const organization = await models.Organization.create({ name: 'Concurrent Claim' });
    const firstLocation = await createLocation(organization);
    const secondLocation = await createLocation(organization);
    const outcomes = await Promise.allSettled([
      firstLocation.update({ slug: 'concurrent-location-claim' }),
      secondLocation.update({ slug: 'concurrent-location-claim' }),
    ]);
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await models.Location.count({ where: { slug: 'concurrent-location-claim' } })).toBe(1);
  });

  it('reports service hours availability in the simplified response', async () => {
    const organization = await models.Organization.create({ name: 'Hours Flag Org' });
    const location = await createLocation(organization);
    const service = await organization.createService({ name: 'A service' });
    await location.addService(service);
    const getFlag = async () => {
      const response = await request(app).get('/locations?locationFieldsOnly=true').expect(200);
      return response.body.find(row => row.id === location.id).has_service_hours;
    };
    expect(await getFlag()).toBe(false);
    const schedule = await service.createHolidaySchedule({
      closed: false, weekday: 1, opens_at: null,
    });
    expect(await getFlag()).toBe(false);
    await schedule.update({ opens_at: '00:00:00', closes_at: '23:59:00' });
    expect(await getFlag()).toBe(true);
    await schedule.destroy();
    expect(await getFlag()).toBe(false);
  });

  it('rolls back triggers without losing aliases or renaming current locations', async () => {
    const organization = await models.Organization.create({ name: 'Rollback Org' });
    const location = await createLocation(organization);
    const oldSlug = await currentSlug(location);
    await organization.update({ name: 'Rollback Renamed' });
    const beforeRollback = await currentSlug(location);
    await migration.down(queryInterface);
    expect(await currentSlug(location)).toBe(beforeRollback);
    await expectRedirect(oldSlug, location);
    const [triggers] = await models.sequelize.query(`
      SELECT tgname FROM pg_trigger WHERE tgrelid = 'locations'::regclass
      AND tgname IN ('init_slug_on_location_identity_update', 'guard_location_slug_owner')
    `);
    expect(triggers).toEqual([]);
    await migration.up(queryInterface);
    expect(await currentSlug(location)).toBe(beforeRollback);
    await expectRedirect(oldSlug, location);
  });
});
