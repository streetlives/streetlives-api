import config from '../config';
import { AuthError, ForbiddenError } from '../utils/errors';

// The feed names who changed what and carries before/after values, so only the machine
// clients listed in CHANGE_FEED_ALLOWED_CLIENT_IDS may read it. API Gateway's Cognito
// authorizer has verified the token by the time its claims reach the Lambda; client
// credentials access tokens identify their app client in `client_id`. Unset means nobody.
export default function changeFeedAuth(req, res, next) {
  const claims = req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer &&
    req.apiGateway.event.requestContext.authorizer.claims;

  if (!claims) {
    next(new AuthError());
    return;
  }

  const clientId = String(claims.client_id || '').trim();
  if (!clientId || !config.changeFeed.allowedClientIds.includes(clientId)) {
    next(new ForbiddenError('This client may not read the change feed'));
    return;
  }

  next();
}
