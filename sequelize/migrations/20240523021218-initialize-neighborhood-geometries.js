'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // get the geojson
    const response = await fetch('https://data.dathere.com/dataset/acbbee9e-4e37-4439-8e69-ca906f476ae3/resource/d6db2e12-fc58-4e41-bc58-5bdfb5078131/download/d085e2f8d0b54d4590b1e7d1f35594c1pediacitiesnycneighborhoods.geojson')
    const geojson = await response.json() 
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
      }
    });
    await queryInterface.sequelize.transaction(async t => Promise.all(
        geojson.features.map(feature => {
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
            { transaction: t }
          )
        })
      )
    );
  },

  async down (queryInterface, Sequelize) {
    return queryInterface.dropTable('nyc_neighborhood_geometries');
  }
};
