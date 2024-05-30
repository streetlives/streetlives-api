
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // get the geojson
    // eslint-disable-next-line max-len,no-undef
    const response = await fetch('https://data.dathere.com/dataset/acbbee9e-4e37-4439-8e69-ca906f476ae3/resource/d6db2e12-fc58-4e41-bc58-5bdfb5078131/download/d085e2f8d0b54d4590b1e7d1f35594c1pediacitiesnycneighborhoods.geojson');
    const geojson = await response.json();
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

    // https://data.cityofnewyork.us/City-Government/Community-Districts/yfnk-k7r4
    // eslint-disable-next-line no-undef
    const response2 = await fetch(`${API_ROOT}/yfnk-k7r4?${API_PARAMS}`);
    const geojson2 = await response2.json();
    await queryInterface.createTable('nyc_community_districts', {
      district_id: {
        type: Sequelize.DataTypes.INTEGER,
        primaryKey: true,
      },
      geometry: {
        type: Sequelize.DataTypes.GEOMETRY('MULTIPOLYGON'),
      },
    });
    await queryInterface.sequelize.query(`
      CREATE INDEX nyc_community_districts_geometry_index 
        ON nyc_community_districts USING GIST (geometry)
    `);
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojson2.features.map(feature =>
        queryInterface.sequelize.query(
          'insert into nyc_community_districts values ($1, ST_GeomFromGeoJSON($2))',
          {
            bind: [
              parseInt(feature.properties.boro_cd, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        ))));

    // https://data.cityofnewyork.us/City-Government/Congressional-Districts/qd3c-zuu7
    // eslint-disable-next-line no-undef
    const response3 = await fetch(`${API_ROOT}/qd3c-zuu7?${API_PARAMS}`);
    const geojson3 = await response3.json();
    await queryInterface.createTable('nyc_congressional_districts', {
      district_id: {
        type: Sequelize.DataTypes.INTEGER,
        primaryKey: true,
      },
      geometry: {
        type: Sequelize.DataTypes.GEOMETRY('MULTIPOLYGON'),
      },
    });
    await queryInterface.sequelize.query(`
      CREATE INDEX nyc_congressional_districts_geometry_index 
        ON nyc_congressional_districts USING GIST (geometry)
    `);
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojson3.features.map(feature =>
        queryInterface.sequelize.query(
          'insert into nyc_community_districts values ($1, ST_GeomFromGeoJSON($2))',
          {
            bind: [
              parseInt(feature.properties.cong_dist, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        ))));

    // https://data.cityofnewyork.us/Education/School-Districts/r8nu-ymqj
    // eslint-disable-next-line no-undef
    const response4 = await fetch(`${API_ROOT}/r8nu-ymqj?${API_PARAMS}`);
    const geojson4 = await response4.json();
    await queryInterface.createTable('nyc_school_districts', {
      district_id: {
        type: Sequelize.DataTypes.INTEGER,
      },
      geometry: {
        type: Sequelize.DataTypes.GEOMETRY('MULTIPOLYGON'),
      },
    });
    await queryInterface.sequelize.query(`
      CREATE INDEX nyc_school_districts_geometry_index 
        ON nyc_school_districts USING GIST (geometry)
    `);
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojson4.features.map(feature =>
        queryInterface.sequelize.query(
          'insert into nyc_school_districts values ($1, ST_GeomFromGeoJSON($2))',
          {
            bind: [
              parseInt(feature.properties.school_dist, 10),
              feature.geometry,
            ],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        ))));

    // TODO: update the locations.neighborhood database table
    // TODO: update the database trigger that keeps this up-to-date
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async t => Promise.all([
      queryInterface.dropTable('nyc_neighborhood_geometries', { transaction: t }),
      queryInterface.dropTable('nyc_community_districts', { transaction: t }),
      queryInterface.dropTable('nyc_congressional_districts', { transaction: t }),
      queryInterface.dropTable('nyc_school_districts', { transaction: t }),
    ]));
  },
};

