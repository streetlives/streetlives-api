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

const NOT_AUTHORIZED = 'Not authorized to edit data for this organization';

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
 * Postgres accepts a UUID with upper-case digits, wrapped in braces, and with
 * some, all or extra hyphens, so normalizing those away and requiring 32 hex
 * digits admits every form a lookup could actually resolve. Anything else is
 * malformed, and the controller's own Joi schema - which validates every
 * identifier on every write route as a guid - will reject it with a 400.
 */
function isResolvableId(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().replace(/^\{/, '').replace(/\}$/, '').replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(normalized);
}

export const scopeResult = {
  resolved: 'resolved',
  unresolved: 'unresolved',
  // A malformed identifier can't name a record, so there is nothing to
  // authorize: deferring leaves the controller's validation to answer 400
  // rather than turning it into a 403 or a failed query.
  malformed: 'malformed',
};

/**
 * Every organization a write request touches, resolved from the route params
 * and from the body fields the route actually consumes.
 *
 * `bodyFields` is an allowlist rather than a shape guess on purpose. A body
 * field that a route ignores must never contribute scope: `POST /organizations`
 * validates with `allowUnknown`, so a caller could otherwise attach an
 * `organizationId` they do hold, satisfy the check with it, and have the
 * controller create an entirely unrelated organization from the rest of the
 * body. Routes opt in, so a new write route fails closed instead of open.
 */
export async function findRequestOrganizationIds(req, bodyFields = []) {
  const params = req.params || {};
  const body = req.body || {};
  const organizationIds = [];

  const add = (organizationId) => {
    if (organizationId && !organizationIds.includes(organizationId)) {
      organizationIds.push(organizationId);
    }
  };

  const fromBody = field => (bodyFields.includes(field) ? body[field] : undefined);

  const identifiers = {
    organizationId: params.organizationId || fromBody('organizationId'),
    locationId: params.locationId || fromBody('locationId'),
    phoneId: params.phoneId,
    serviceId: params.serviceId,
  };

  const present = Object.values(identifiers).filter(value => value !== undefined);
  if (present.some(value => !isResolvableId(value))) {
    return { status: scopeResult.malformed, organizationIds: [] };
  }

  // A location update carrying `organizationId` is reassigning the location, so
  // both its current and its target organization are in play - otherwise a
  // scoped caller could move someone else's location into their own namespace,
  // or their own location out of it.
  add(params.organizationId);
  add(fromBody('organizationId'));

  if (identifiers.locationId) {
    const organizationId = await findLocationOrganizationId(identifiers.locationId);
    if (!organizationId) {
      return { status: scopeResult.unresolved, organizationIds: [] };
    }
    add(organizationId);
  }

  if (identifiers.phoneId) {
    const organizationId = await findPhoneOrganizationId(identifiers.phoneId);
    if (!organizationId) {
      return { status: scopeResult.unresolved, organizationIds: [] };
    }
    add(organizationId);
  }

  if (identifiers.serviceId) {
    const service = await models.Service.findByPk(identifiers.serviceId, {
      attributes: ['organization_id'],
    });
    if (!service) {
      return { status: scopeResult.unresolved, organizationIds: [] };
    }
    add(service.organization_id);
  }

  return { status: scopeResult.resolved, organizationIds };
}

/**
 * Gate for the data-entry write routes. Admins and street-team accounts keep
 * the directory-wide access they have always had; providers are held to the
 * organizations in their own claim.
 */
export async function assertDataEntryScope(req, bodyFields = []) {
  if (req.userIsAdmin || !req.userIsProvider) {
    return;
  }

  const { status, organizationIds } = await findRequestOrganizationIds(req, bodyFields);

  if (status === scopeResult.malformed) {
    return;
  }

  // An empty list means the request names no existing organization at all -
  // creating a new one - which is not something a scoped caller may do.
  if (status !== scopeResult.resolved || !organizationIds.length) {
    throw new ForbiddenError(NOT_AUTHORIZED);
  }

  const outOfScope = organizationIds
    .some(organizationId => !hasOrganizationScope(req, organizationId));
  if (outOfScope) {
    throw new ForbiddenError(NOT_AUTHORIZED);
  }
}

export default {
  hasOrganizationScope,
  requireOrganizationScope,
  findRequestOrganizationIds,
  assertDataEntryScope,
  scopeResult,
};
