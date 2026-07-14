// The per-client NL rate limit and comment abuse records key off this value,
// so it must not be attacker-controlled. x-forwarded-for is deliberately
// ignored: API Gateway passes the caller's own header values through, so its
// first entry is spoofable and rotating it would bypass any per-client limit.
// In production we use the source IP API Gateway derives from the TCP
// connection (requestContext.identity.sourceIp, attached to the request by
// aws-serverless-express's eventContext middleware); locally we fall back to
// the direct socket address.
export const getClientIp = (req) => {
  const apiGatewayIp = req.apiGateway
    && req.apiGateway.event
    && req.apiGateway.event.requestContext
    && req.apiGateway.event.requestContext.identity
    && req.apiGateway.event.requestContext.identity.sourceIp;

  const ip = apiGatewayIp
    || req.ip
    || (req.connection && req.connection.remoteAddress)
    || 'unknown';

  // Remove IPv6 prefix (if present)
  return ip.replace(/^::ffff:/, '');
};

export default getClientIp;
