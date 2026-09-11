
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      create type age_eligibility as (
        age_max integer,
        age_min integer,
        all_ages bool,
        population_served varchar
      )
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('drop type age_eligibility');
  },
};
