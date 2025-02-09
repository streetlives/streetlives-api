/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // eslint-disable-next-line max-len
      await queryInterface.sequelize.query("ALTER TYPE enum_nyc_districts_type ADD VALUE 'city-council'");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    // eslint-disable-next-line max-len
    const url = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/NYC_City_Council_Districts_Water_Included/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=pgeojson';
    const geojsonCityCouncilDistricts =
      // eslint-disable-next-line no-undef
      await (await fetch(url)).json();
    await queryInterface.sequelize.transaction(async t =>
      Promise.all(geojsonCityCouncilDistricts.features.map((feature) => {
        const f = {
          ...feature,
          geometry: {
            ...feature.geometry,
            type: 'MultiPolygon',
            coordinates: feature.geometry.type === 'Polygon' ?
              [feature.geometry.coordinates] :
              feature.geometry.coordinates,
          },
        };
        return queryInterface.sequelize.query(
          "insert into nyc_districts values ($1, ST_GeomFromGeoJSON($2), 'city-council')",
          {
            bind: [f.properties.CounDist, f.geometry],
            type: Sequelize.QueryTypes.INSERT,
          },
          { transaction: t },
        );
      })));
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.sequelize.query(
      "delete from nyc_districts where type = 'city-council'",
      { type: Sequelize.QueryTypes.DELETE },
    );
  },
};
