module.exports = (sequelize, DataTypes, Op) => {
  const NycNeighborhoodGeometries = sequelize.define('NycNeighborhoodGeometries', {
    neighborhood: {
      type: DataTypes.TEXT,
    },
    borough: {
      type: DataTypes.TEXT,
    },
    geometry: {
      type: DataTypes.GEOMETRY('Polygon'),
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  NycNeighborhoodGeometries.findByLatLong = async (latitude, longitude) => {
    // where ST_Contains(nng.geometry, pa.point)
    const contains = sequelize.fn(
      'ST_Contains',
      sequelize.col('geometry'),
      sequelize.literal(`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) `),
    );

    const containsCondition = sequelize.where(contains, true);

    return NycNeighborhoodGeometries.findOne({
      attributes: [
        'neighborhood',
        'borough',
      ],
      where: containsCondition,
    });
  };

  return NycNeighborhoodGeometries;
};

