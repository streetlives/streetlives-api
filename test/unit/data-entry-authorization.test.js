/**
 * @jest-environment node
 *
 * Every account - Streetlives street team and external organization
 * representatives alike - lives in the same Cognito pool, so being
 * authenticated says nothing about which organization's records a caller may
 * write. These cover both directions of the gate: that providers are held to
 * the organizations in their own claim, and that street-team and admin access
 * stays directory-wide.
 */

import dataEntryAuth from '../../src/middleware/data-entry-auth';
import getUser from '../../src/middleware/get-user';
import models from '../../src/models';
import { ForbiddenError } from '../../src/utils/errors';

jest.mock('../../src/models', () => ({
  __esModule: true,
  default: {
    Location: { findByPk: jest.fn() },
    Phone: { findByPk: jest.fn() },
    Service: { findByPk: jest.fn() },
    Organization: { findByPk: jest.fn() },
    ServiceAtLocation: { findByPk: jest.fn() },
  },
}));

const OWN_ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LOCATION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PHONE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SERVICE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const originalEnv = process.env.NODE_ENV;

// dataEntryAuth's metadata rule is skipped in development/test, but the
// organization gate is not - these run as if deployed.
beforeAll(() => { process.env.NODE_ENV = 'production'; });
afterAll(() => { process.env.NODE_ENV = originalEnv; });

beforeEach(() => {
  jest.clearAllMocks();
  models.Location.findByPk.mockResolvedValue(null);
  models.Phone.findByPk.mockResolvedValue(null);
  models.Service.findByPk.mockResolvedValue(null);
  models.ServiceAtLocation.findByPk.mockResolvedValue(null);
});

function makeRequest({ params = {}, body = {}, ...user } = {}) {
  return { params, body, ...user };
}

const provider = extra => makeRequest({
  userIsProvider: true,
  userOrganizationIds: [OWN_ORG],
  ...extra,
});

const streetTeam = extra => makeRequest({ ...extra });

async function run(req) {
  const next = jest.fn();
  await dataEntryAuth(req, {}, next);
  return next;
}

async function expectAllowed(req) {
  const next = await run(req);
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith();
}

async function expectForbidden(req) {
  const next = await run(req);
  expect(next).toHaveBeenCalledTimes(1);
  const [err] = next.mock.calls[0];
  expect(err).toBeInstanceOf(ForbiddenError);
}

describe('street team and admins keep directory-wide data entry', () => {
  // Most street-team accounts carry no custom:orgs claim at all, so a check
  // that simply required one would lock the data-entry tool out entirely.
  it('allows a street-team account with no organization claim', async () => {
    models.Organization.findByPk.mockResolvedValue({ id: OTHER_ORG });
    await expectAllowed(streetTeam({ params: { organizationId: OTHER_ORG } }));
  });

  it('allows a street-team account to edit an organization outside its claim', async () => {
    await expectAllowed(streetTeam({
      userOrganizationIds: [OWN_ORG],
      params: { organizationId: OTHER_ORG },
    }));
  });

  it('allows an admin who is also a provider', async () => {
    await expectAllowed(makeRequest({
      userIsAdmin: true,
      userIsProvider: true,
      userOrganizationIds: [OWN_ORG],
      params: { organizationId: OTHER_ORG },
    }));
  });

  it('still refuses custom metadata from a non-admin', async () => {
    await expectForbidden(streetTeam({ body: { metadata: { source: 'spoofed' } } }));
  });
});

describe('providers are held to their own organizations', () => {
  it('allows updating an organization in its claim', async () => {
    await expectAllowed(provider({ params: { organizationId: OWN_ORG } }));
  });

  it('refuses updating another organization', async () => {
    await expectForbidden(provider({ params: { organizationId: OTHER_ORG } }));
  });

  it('refuses creating a new organization', async () => {
    await expectForbidden(provider({ body: { name: 'New org' } }));
  });

  it('refuses creating a location under another organization', async () => {
    await expectForbidden(provider({ body: { organizationId: OTHER_ORG } }));
  });

  it("refuses editing another organization's location", async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({ params: { locationId: LOCATION_ID } }));
  });

  it('allows editing its own location', async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OWN_ORG });
    await expectAllowed(provider({ params: { locationId: LOCATION_ID } }));
  });

  it("refuses deleting another organization's phone", async () => {
    models.Phone.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({ params: { phoneId: PHONE_ID } }));
  });

  it('resolves a phone attached to a location rather than an organization', async () => {
    models.Phone.findByPk.mockResolvedValue({ location_id: LOCATION_ID });
    models.Location.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({ params: { phoneId: PHONE_ID } }));
  });

  it('resolves a phone attached to a service rather than an organization', async () => {
    models.Phone.findByPk.mockResolvedValue({ service_id: SERVICE_ID });
    models.Service.findByPk.mockResolvedValue({ organization_id: OWN_ORG });
    await expectAllowed(provider({ params: { phoneId: PHONE_ID } }));
  });

  it("refuses deleting another organization's service", async () => {
    models.Service.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({ params: { serviceId: SERVICE_ID } }));
  });

  it('refuses adding a service to another organization\'s location', async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({ body: { locationId: LOCATION_ID } }));
  });

  // Fail closed: an unresolvable target must not be read as "unscoped".
  it('refuses when the target record does not exist', async () => {
    await expectForbidden(provider({ params: { serviceId: SERVICE_ID } }));
  });
});

describe('reassigning a location between organizations', () => {
  it('refuses moving its own location into another organization', async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OWN_ORG });
    await expectForbidden(provider({
      params: { locationId: LOCATION_ID },
      body: { organizationId: OTHER_ORG },
    }));
  });

  it("refuses pulling another organization's location into its own", async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectForbidden(provider({
      params: { locationId: LOCATION_ID },
      body: { organizationId: OWN_ORG },
    }));
  });

  it('allows a street-team account to reassign a location', async () => {
    models.Location.findByPk.mockResolvedValue({ organization_id: OTHER_ORG });
    await expectAllowed(streetTeam({
      params: { locationId: LOCATION_ID },
      body: { organizationId: OWN_ORG },
    }));
  });
});

describe('getUser group claims', () => {
  const requestWithClaims = claims => ({
    apiGateway: { event: { requestContext: { authorizer: { claims } } } },
  });

  const parse = (claims) => {
    const req = requestWithClaims(claims);
    getUser(req, {}, () => {});
    return req;
  };

  it('flags providers from a comma-separated group claim', () => {
    const req = parse({ sub: 'user-1', 'cognito:groups': 'Providers' });
    expect(req.userIsProvider).toBe(true);
    expect(req.userIsAdmin).toBeUndefined();
  });

  it('flags providers from an array group claim', () => {
    const req = parse({ sub: 'user-1', 'cognito:groups': ['StreetlivesAdmins', 'Providers'] });
    expect(req.userIsProvider).toBe(true);
    expect(req.userIsAdmin).toBe(true);
  });

  it('leaves an ungrouped street-team account unflagged', () => {
    const req = parse({ sub: 'user-1', 'custom:orgs': OWN_ORG });
    expect(req.userIsProvider).toBeUndefined();
    expect(req.userIsAdmin).toBeUndefined();
    expect(req.userOrganizationIds).toEqual([OWN_ORG]);
  });

  // Membership is an exact match, not a substring of the joined claim.
  it('does not flag a group that merely contains the provider group name', () => {
    const req = parse({ sub: 'user-1', 'cognito:groups': 'ProvidersReadOnly' });
    expect(req.userIsProvider).toBeUndefined();
  });
});
