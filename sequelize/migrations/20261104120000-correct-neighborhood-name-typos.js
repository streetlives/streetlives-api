/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE nyc_neighborhood_geometries
      SET neighborhood = CASE neighborhood
        WHEN 'Mrrisania' THEN 'Morrisania'
        WHEN 'Scarrett City' THEN 'Starrett City'
        WHEN 'Tomkinsville' THEN 'Tompkinsville'
        WHEN 'Waterleigh' THEN 'Westerleigh'
      END
      WHERE neighborhood IN (
        'Mrrisania', 'Scarrett City', 'Tomkinsville', 'Waterleigh'
      )
    `);
  },

  async down() {
    // Keep the corrected canonical names if this migration is rolled back.
  },
};
