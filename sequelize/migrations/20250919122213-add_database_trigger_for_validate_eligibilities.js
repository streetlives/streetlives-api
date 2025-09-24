// migrations/20250919-add-eligibilities-json-validation.js

export async function up(queryInterface, Sequelize) {
  // 1. Create validation function
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE FUNCTION validate_eligibility_values()
    RETURNS TRIGGER AS $$
    DECLARE
      age_min_text TEXT;
      age_max_text TEXT;
    BEGIN
      -- Extract age_min as text
      age_min_text := NEW.eligible_values ->> 'age_min';
      age_min_text := NEW.eligible_values ->> 'age_max';

      -- If it's not null, check if it's a number
      IF age_min_text IS NOT NULL AND age_min_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid eligible_values.age_min: must be a number, got "%" ', age_min_text;
      END IF;

      IF age_max_text IS NOT NULL AND age_max_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid eligible_values.age_max: must be a number, got "%" ', age_max_text;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. Create trigger
  await queryInterface.sequelize.query(`
    CREATE TRIGGER validate_eligibilities_json
    BEFORE INSERT OR UPDATE ON "eligibility"
    FOR EACH ROW
    EXECUTE FUNCTION validate_eligibility_values();
  `);
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.sequelize.query(`
    DROP TRIGGER IF EXISTS validate_eligibilities_json ON "eligibilities";
  `);

  await queryInterface.sequelize.query(`
    DROP FUNCTION IF EXISTS validate_eligibility_values();
  `);
}
