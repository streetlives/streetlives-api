/**
 * @jest-environment node
 */

// The body-parser dispatcher in src/app.js picks the 6mb limit by matching the
// request against a path pattern, which duplicates the route string registered
// in src/routes.js. These tests pin the two together: a mismatch would either
// 413 every upload or quietly lift the 100KB default off an unrelated route.

const {
  isPhotoUpload,
  LOCATION_PHOTO_ROUTE,
} = require('../../src/utils/photo-upload-path');

const req = (method, path) => ({ method, path });

describe('isPhotoUpload', () => {
  it('matches the registered upload route', () => {
    const id = '2cf4913e-bd4b-43ae-b06f-eb12a3835f73';
    const path = LOCATION_PHOTO_ROUTE.replace(':locationId', id);
    expect(isPhotoUpload(req('PUT', path))).toBe(true);
  });

  it('matches the same route with a trailing slash', () => {
    expect(isPhotoUpload(req('PUT', '/locations/abc/photo/'))).toBe(true);
  });

  it.each([
    ['a POST to the same path', 'POST', '/locations/abc/photo'],
    ['the DELETE route, which carries no body', 'DELETE', '/locations/abc/photo'],
    ['a similarly named path', 'PUT', '/locations/abc/photos'],
    ['the location collection', 'PUT', '/locations'],
    ['a single location', 'PUT', '/locations/abc'],
    ['an extra path segment', 'PUT', '/locations/a/b/photo'],
    ['an unrelated route', 'PATCH', '/locations/abc'],
  ])('does not match %s', (_label, method, path) => {
    expect(isPhotoUpload(req(method, path))).toBe(false);
  });
});
