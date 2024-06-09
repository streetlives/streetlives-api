
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
    await queryInterface.sequelize.query(`
      create or replace function is_age_eligibility_requirement_met(
        age integer,
        age_eligibility_criterion jsonb
      )
         returns bool
        as
        $$
        select
          -- either no age eligibility criteria are listed for service, OR
          age_eligibility_criterion is null OR
          jsonb_array_length(age_eligibility_criterion) = 0 OR
          -- age eligibility is listed AND 
          -- exists at least one eligibility that fulfills the following criteria:
          (
            select count(1) 
            from jsonb_populate_recordset(null::age_eligibility, age_eligibility_criterion)
            where
               -- all ages, OR
               all_ages is not null and all_ages OR
                -- age is greater than min age and less than max age
               (age_min is not null and age_max is not null and 
                  age <= age_max and age >= age_min) OR
                -- age is less than max age and min age is null, OR
               (age_min is null and age_max is not null and age <= age_max) OR
               -- age is greater than min age and max age is null, OR
               (age_min is not null and age_max is null and age >= age_min)
          ) > 0
      $$
      language sql
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('drop function is_age_eligibility_requirement_met');
    await queryInterface.sequelize.query('drop type age_eligibility');
  },
};
