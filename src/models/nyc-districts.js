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

    const dbResult = await NycDistricts.findAll({
      attributes: [
        'type',
        [sequelize.literal('(ARRAY_AGG(district_id))[1]'), 'districtId'],
      ],
      group: [
        'type',
      ],
      where: containsCondition,
    });

    const keys = [
      'school',
      'community',
      'congressional',
      'state_assembly_districts_clipped_to_shoreline',
      'state_assembly_districts_water_areas_included',
      'us_congressional_districts_clipped_to_shoreline',
      'us_congressional_districts_water_areas_included',
      'state_senate_districts_clipped_to_shoreline',
      'state_senate_districts_water_areas_included',
      'municipal_court_districts_clipped_to_shoreline',
      'municipal_court_districts_water_areas_included',
      'city_council_districts_clipped_to_shoreline',
      'city_council_districts_water_areas_included',
      'election_districts_clipped_to_shoreline',
      'election_districts_water_areas_included',
    ];
    const response = Object.fromEntries(keys.map((key) => {
      const row = dbResult.find(dbRow => dbRow.dataValues.type === key);
      return [key, row && row.dataValues.districtId];
    }).filter(([k, v]) => v));

    return response;
  };

  return NycDistricts;
};

