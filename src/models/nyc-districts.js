module.exports = (sequelize, DataTypes, Op) => {
  const NycDistricts = sequelize.define('NycDistricts', {
    district_id: {
      type: DataTypes.TEXT,
    },
    geometry: {
      type: DataTypes.GEOMETRY('MultiPolygon'),
    },
    type: {
      type: DataTypes.ENUM(['community', 'congressional', 'school']),
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  NycDistricts.findByLatLong = async (latitude, longitude) => {
    const contains = sequelize.fn(
      'ST_Contains',
      sequelize.col('geometry'),
      sequelize.literal(`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) `),
    );

    const containsCondition = sequelize.where(contains, true);

    return (await NycDistricts.findAll({
      attributes: [
        'district_id',
        'type',
      ],
      group: [
        'district_id',
        'type',
      ],
      where: containsCondition,
    })).reduce((a, b) => ({
      ...a,
      [b.type]: b.district_id,
    }), {});
  };

  return NycDistricts;
};

