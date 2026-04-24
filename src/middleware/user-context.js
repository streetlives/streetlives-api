import config from '../config';

export function getUserClaims(req) {
  return req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer &&
    req.apiGateway.event.requestContext.authorizer.claims;
}

export function applyUserContext(req, claims) {
  if (!claims || !claims.sub) {
    return false;
  }

  req.user = claims.sub;

  const organizationClaims = claims['custom:orgs'];
  if (organizationClaims && organizationClaims.length) {
    req.userOrganizationIds = organizationClaims.split(',');
  }

  const groups = claims['cognito:groups'];
  if (groups && groups.indexOf(config.adminGroupName) !== -1) {
    req.userIsAdmin = true;
  }

  return true;
}
