const types = {
  point: 'Point',
  lineString: 'LineString',
  polygon: 'Polygon',
  multiPoint: 'MultiPoint',
  multiLineString: 'MultiLineString',
  multiPolygon: 'MultiPolygon',
  geometryCollection: 'GeometryCollection',
};

const createPoint = (longitude, latitude) => ({
  type: types.point,
  coordinates: [longitude, latitude],
});

export default {
  createPoint,
};
