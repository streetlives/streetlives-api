import { AuthError } from '../utils/errors';
import config from '../config';

export default function getUser(req, res, next) {
  const claims = req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer &&
    req.apiGateway.event.requestContext.authorizer.claims;

  if (claims && claims.sub) {
    req.user = claims.sub;

    const organizationClaims = claims['custom:organizations'];
    if (organizationClaims && organizationClaims.length) {
      req.userOrganizationIds = organizationClaims.split(',');
    }

    const groups = claims['cognito:groups'];
    if (groups && groups.indexOf(config.adminGroupName)) {
      req.userIsAdmin = true;
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
