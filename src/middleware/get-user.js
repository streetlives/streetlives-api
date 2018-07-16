export default function getUser(req, res, next) {
  const user = req.apiGateway &&
    req.apiGateway.event &&
    req.apiGateway.event.requestContext &&
    req.apiGateway.event.requestContext.authorizer &&
    req.apiGateway.event.requestContext.authorizer.claims &&
    req.apiGateway.event.requestContext.authorizer.claims.sub;

  if (user) {
    req.user = user;
    next();
    return;
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    req.user = '<Anonymous>';
    next();
  } else {
    next(new Error('No authenticated user found'));
  }
}
