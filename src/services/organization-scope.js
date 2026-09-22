import models from '../models';
import { ForbiddenError } from '../utils/errors';

/**
 * Organization scoping for authenticated callers.
 *
 * Every account lives in the same Cognito pool (`StreetTeam`), so being
 * authenticated says nothing about which organization's records a caller may
 * touch. Two kinds of account share that pool:
 *
 *  - Streetlives street-team staff (and admins), who curate the whole NYC
 *    directory and are expected to edit any organization's records.
 *  - External organization representatives in the `Providers` group, who are
 *    given logins purely so they can respond to feedback about their own
 *    organization. Their `custom:orgs` claim lists the organizations they
 *    represent.
 *
 * The gate below therefore holds providers to their own claim while leaving
 * street-team access directory-wide. It is shaped as a restriction on providers
 * rather than as a claim required of everyone because most street-team accounts
 * carry no `custom:orgs` claim at all, and requiring one would lock them out of
 * the data-entry tool entirely.
 */

export function hasOrganizationScope(req, organizationId) {
  return !!organizationId &&
    !!req.userOrganizationIds &&
    req.userOrganizationIds.includes(organizationId);
}

/**
 * Strict scope check: the caller must represent this organization. Used where
 * the action is taken *on behalf of* an organization (replying to feedback as
 * that organization), which is a provider action even for Streetlives staff.
 */
export function requireOrganizationScope(req, organizationId, message) {
  if (!hasOrganizationScope(req, organizationId)) {
    throw new ForbiddenError(message);
  }
}

async function findLocationOrganizationId(locationId) {
  const location = await models.Location.findByPk(locationId, {
    attributes: ['organization_id'],
  });
  return location ? location.organization_id : null;
}

async function findPhoneOrganizationId(phoneId) {
  const phone = await models.Phone.findByPk(phoneId, {
    attributes: ['organization_id', 'location_id', 'service_id', 'service_at_location_id'],
  });
  if (!phone) {
    return null;
  }

  if (phone.organization_id) {
    return phone.organization_id;
  }
  if (phone.location_id) {
    return findLocationOrganizationId(phone.location_id);
  }
  if (phone.service_id) {
    const service = await models.Service.findByPk(phone.service_id, {
      attributes: ['organization_id'],
    });
    return service ? service.organization_id : null;
  }
  if (phone.service_at_location_id) {
    const serviceAtLocation = await models.ServiceAtLocation.findByPk(
      phone.service_at_location_id,
      { attributes: ['location_id'] },
    );
    return serviceAtLocation
      ? findLocationOrganizationId(serviceAtLocation.location_id)
      : null;
  }

  return null;
}

/**
 * Every organization a write request touches, resolved from the route params
 * and body. Returns null when a referenced record doesn't exist, so callers can
 * fail closed rather than let an unresolvable target through.
 *
 * A location update that carries `organizationId` is reassigning the location
 * into another organization, so both the current and the target organization
 * are included - otherwise a provider could move someone else's location into
 * their own namespace, or their own location out of it.
 */
export async function findRequestOrganizationIds(req) {
  const params = req.params || {};
  const body = req.body || {};
  const organizationIds = [];

  const add = (organizationId) => {
    if (organizationId && !organizationIds.includes(organizationId)) {
      organizationIds.push(organizationId);
    }
  };

  add(params.organizationId);
  add(body.organizationId);

  const locationId = params.locationId || body.locationId;
  if (locationId) {
    const organizationId = await findLocationOrganizationId(locationId);
    if (!organizationId) {
      return null;
    }
    add(organizationId);
  }

  if (params.phoneId) {
    const organizationId = await findPhoneOrganizationId(params.phoneId);
    if (!organizationId) {
      return null;
    }
    add(organizationId);
  }

  if (params.serviceId) {
    const service = await models.Service.findByPk(params.serviceId, {
      attributes: ['organization_id'],
    });
    if (!service) {
      return null;
    }
    add(service.organization_id);
  }

  return organizationIds;
}

/**
 * Gate for the data-entry write routes. Admins and street-team accounts keep
 * the directory-wide access they have always had; providers are held to the
 * organizations in their own claim.
 */
export async function assertDataEntryScope(req) {
  if (req.userIsAdmin || !req.userIsProvider) {
    return;
  }

  const organizationIds = await findRequestOrganizationIds(req);

  // An empty list means the request isn't tied to an existing organization at
  // all (creating a new one); null means a referenced record couldn't be
  // resolved. Neither is something a scoped provider may do.
  if (!organizationIds || !organizationIds.length) {
    throw new ForbiddenError('Not authorized to edit data for this organization');
  }

  const outOfScope = organizationIds
    .some(organizationId => !hasOrganizationScope(req, organizationId));
  if (outOfScope) {
    throw new ForbiddenError('Not authorized to edit data for this organization');
  }
}

export default {
  hasOrganizationScope,
  requireOrganizationScope,
  findRequestOrganizationIds,
  assertDataEntryScope,
};
