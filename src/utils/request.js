export const getClientIp = (req) => {
  const forwardedIp = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : null;

  const ip = forwardedIp || req.ip || req.connection.remoteAddress;

  // Remove IPv6 prefix (if present)
  return ip.replace(/^::ffff:/, '');
};

export default getClientIp;
