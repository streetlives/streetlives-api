import config from '../config';
import { AuthError, ForbiddenError } from '../utils/errors';

// The feed names who changed what and carries before/after values, so only the machine
// clients listed in CHANGE_FEED_ALLOWED_CLIENT_IDS may read it. Unset means nobody.
// API Gateway sets requestContext.authorizer after verifying the token, so a caller can't
// supply it. A Cognito user pool authorizer passes the token's claims; the internal API's
// Lambda authorizer (InternalApiAuthorizer) verifies the same access token and passes its
// app client as context.clientId.
const verifiedClientId = (authorizer) => {
  const fromClaims = authorizer.claims && authorizer.claims.client_id;
  return String(fromClaims || authorizer.clientId || '').trim();
};

export default function changeFeedAuth(req, res, next) {
  const authorizer = req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer;

  if (!authorizer || (!authorizer.claims && !authorizer.clientId)) {
    next(new AuthError());
    return;
  }

  const clientId = verifiedClientId(authorizer);
  if (!clientId || !config.changeFeed.allowedClientIds.includes(clientId)) {
    next(new ForbiddenError('This client may not read the change feed'));
    return;
  }

  next();
}
