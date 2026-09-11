const fs = require('fs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // get the geojson

    // eslint-disable-next-line max-len,no-undef
    // lightly modified from: https://data.dathere.com/dataset/acbbee9e-4e37-4439-8e69-ca906f476ae3/resource/d6db2e12-fc58-4e41-bc58-5bdfb5078131/download/d085e2f8d0b54d4590b1e7d1f35594c1pediacitiesnycneighborhoods.geojson
    const geojson = JSON.parse(fs.readFileSync(`${__dirname}/map.geojson`, 'utf8'));
    // create the table
    await queryInterface.createTable('nyc_neighborhood_geometries', {
      neighborhood: {
        type: Sequelize.DataTypes.STRING,
      },
      borough: {
        type: Sequelize.DataTypes.STRING,
      },
      geometry: {
        type: Sequelize.DataTypes.GEOMETRY('POLYGON'),
      },
    });
    await queryInterface.sequelize.query(`
      CREATE INDEX nyc_neighborhood_geometries_index 
        ON nyc_neighborhood_geometries USING GIST (geometry)
    `);
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojson.features.map(feature =>
        queryInterface.sequelize.query(
          'insert into nyc_neighborhood_geometries values ($1, $2, ST_GeomFromGeoJSON($3))',
          {
            bind: [
              feature.properties.neighborhood,
              feature.properties.borough,
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        ))));

    const API_ROOT = 'https://data.cityofnewyork.us/api/geospatial';
    const API_PARAMS = 'method=export&format=GeoJSON';

    await queryInterface.createTable('nyc_districts', {
      district_id: {
        type: Sequelize.DataTypes.INTEGER,
      },
      geometry: {
        type: Sequelize.DataTypes.GEOMETRY('MULTIPOLYGON'),
      },
      type: {
        type: Sequelize.DataTypes.ENUM(['community', 'congressional', 'school']),
      },
    });

    // https://data.cityofnewyork.us/City-Government/Community-Districts/yfnk-k7r4
    const geojsonCommunityDistricts = await (
    // eslint-disable-next-line no-undef
      await fetch(`${API_ROOT}/yfnk-k7r4?${API_PARAMS}`)).json();
    // https://data.cityofnewyork.us/City-Government/Congressional-Districts/qd3c-zuu7
    const geojsonCongressionalDistricts = await (
    // eslint-disable-next-line no-undef
      await fetch(`${API_ROOT}/qd3c-zuu7?${API_PARAMS}`)).json();
    // https://data.cityofnewyork.us/Education/School-Districts/r8nu-ymqj
    const geojsonSchoolDistricts = await (
    // eslint-disable-next-line no-undef
      await fetch(`${API_ROOT}/r8nu-ymqj?${API_PARAMS}`)).json();

    await queryInterface.sequelize.query(`
      CREATE INDEX nyc_districts_geometry_index 
        ON nyc_districts USING GIST (geometry)
    `);
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojsonCommunityDistricts.features.map(feature =>
        queryInterface.sequelize.query(
          "insert into nyc_districts values ($1, ST_GeomFromGeoJSON($2), 'community')",
          {
            bind: [
              parseInt(feature.properties.boro_cd, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        )).concat(geojsonCongressionalDistricts.features.map(feature =>
        queryInterface.sequelize.query(
          "insert into nyc_districts values ($1, ST_GeomFromGeoJSON($2), 'congressional')",
          {
            bind: [
              parseInt(feature.properties.cong_dist, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        ))).concat(geojsonSchoolDistricts.features.map(feature =>
        queryInterface.sequelize.query(
          "insert into nyc_districts values ($1, ST_GeomFromGeoJSON($2), 'school')",
          {
            bind: [
              parseInt(feature.properties.school_dist, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        )))));
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async t => Promise.all([
      queryInterface.dropTable('nyc_neighborhood_geometries', { transaction: t }),
      queryInterface.dropTable('nyc_districts', { transaction: t }),
    ]));
  },
};

