// The body-parser limit in src/app.js is chosen by matching the request path,
// which necessarily duplicates the route registered in src/routes.js. Both
// derive from the single definition here so they cannot drift: a mismatch
// would either 413 every upload or lift the 100KB default off another route.

export const LOCATION_PHOTO_ROUTE = '/locations/:locationId/photo';

const PATTERN = new RegExp(`^${LOCATION_PHOTO_ROUTE.replace(/:[^/]+/g, '[^/]+')}/?$`);

export const isPhotoUpload = req =>
  req.method === 'PUT' && PATTERN.test(req.path);

export default { LOCATION_PHOTO_ROUTE, isPhotoUpload };
