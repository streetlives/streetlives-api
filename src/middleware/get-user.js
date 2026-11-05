import { AuthError } from '../utils/errors';
import config from '../config';

// Cognito hands `cognito:groups` over as an array or as a comma-separated
// string depending on how the claim reaches us; normalize so membership is an
// exact match rather than a substring one.
function parseGroups(groupClaims) {
  if (!groupClaims) {
    return [];
  }

  const groups = Array.isArray(groupClaims) ? groupClaims : groupClaims.split(',');
  return groups.map(group => group.trim()).filter(group => group.length);
}

export default function getUser(req, res, next) {
  const claims = req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer &&
    req.apiGateway.event.requestContext.authorizer.claims;

  if (claims && claims.sub) {
    req.user = claims.sub;

    const organizationClaims = claims['custom:orgs'];
    if (organizationClaims && organizationClaims.length) {
      req.userOrganizationIds = organizationClaims.split(',');
    }

    const groups = parseGroups(claims['cognito:groups']);
    if (groups.includes(config.adminGroupName)) {
      req.userIsAdmin = true;
    }
    if (groups.includes(config.providerGroupName)) {
      req.userIsProvider = true;
    }

    next();
    return;
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    req.user = '<Anonymous>';
    next();
  } else {
    next(new AuthError());
  }
}
