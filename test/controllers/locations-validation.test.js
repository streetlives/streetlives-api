const Joi = require('joi');

const validateFindCatalog = (query) => {
  jest.resetModules();
  const locationSchemas = require('../../src/controllers/validation/locations').default;
  return Joi.validate({ query }, locationSchemas.findCatalog, { allowUnknown: true });
};

describe('location catalog validation', () => {
  it('accepts supported sortBy values', () => {
    const nearbyResult = validateFindCatalog({
      latitude: 40.7,
      longitude: -73.9,
      radius: 1000,
      sortBy: 'nearby',
    });
    const recentlyUpdatedResult = validateFindCatalog({
      latitude: 40.7,
      longitude: -73.9,
      radius: 1000,
      sortBy: 'recentlyUpdated',
    });

    expect(nearbyResult.error).toBeNull();
    expect(recentlyUpdatedResult.error).toBeNull();
  });

  it('rejects unsupported sortBy values', () => {
    const result = validateFindCatalog({
      latitude: 40.7,
      longitude: -73.9,
      radius: 1000,
      sortBy: 'mostServices',
    });

    expect(result.error).not.toBeNull();
  });
});
