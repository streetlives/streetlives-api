import assert from 'assert';

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
    assert.strictEqual(typeof latitude, 'number');
    assert.strictEqual(typeof longitude, 'number');
    const contains = sequelize.fn(
      'ST_Contains',
      sequelize.col('geometry'),
      sequelize.fn(
        'ST_SetSRID',
        sequelize.fn(
          'ST_MakePoint',
          sequelize.literal(longitude),
          sequelize.literal(latitude),
        ),
        sequelize.literal(4326),
      ),
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

