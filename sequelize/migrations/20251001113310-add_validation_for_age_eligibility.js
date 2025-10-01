'use strict';

import models from '../../src/models';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Replace this with the paramiter_id you want to validate against
    const eligibilityParam = await models.EligibilityParameter.findOne({
      where: { name: 'age' },
    });;
    const TARGET_PARAMETER_ID = eligibilityParam.id;

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION validate_eligible_values()
      RETURNS trigger AS $$
      const targetParamId = '${TARGET_PARAMETER_ID}';

      // Only validate if parameter_id matches the target
      if (NEW.parameter_id !== targetParamId) {
        return NEW;
      }

      const schema = {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "age_max": { "type": ["integer", "null"] },
            "age_min": { "type": ["integer", "null"] },
            "all_ages": { "type": "boolean" },
            "population_served": { "type": ["string", "null"] }
          },
          "required": ["age_max", "age_min", "all_ages", "population_served"],
          "additionalProperties": false
        }
      };

      // Minimal JSON schema validator
      function validate(data, schema) {
        if (schema.type === 'array') {
          if (!Array.isArray(data)) return false;
          return data.every(item => validate(item, schema.items));
        }
        if (schema.type === 'object') {
          if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;

          // required keys
          if (schema.required) {
            for (let key of schema.required) {
              if (!(key in data)) return false;
            }
          }

          // check properties
          for (let key in data) {
            if (!schema.properties[key] && schema.additionalProperties === false) {
              return false;
            }
            if (schema.properties[key]) {
              if (!validate(data[key], schema.properties[key])) return false;
            }
          }
          return true;
        }
        if (Array.isArray(schema.type)) {
          return schema.type.some(t => validate(data, { type: t }));
        }
        if (schema.type === 'integer') return Number.isInteger(data);
        if (schema.type === 'string') return typeof data === 'string';
        if (schema.type === 'boolean') return typeof data === 'boolean';
        if (schema.type === 'null') return data === null;
        return false;
      }

      if (!validate(NEW.eligible_values, schema)) {
        throw new Error("Invalid eligible_values JSON structure for parameter_id " + targetParamId);
      }

      return NEW;
      $$ LANGUAGE plv8;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER validate_eligible_values_trigger
      BEFORE INSERT OR UPDATE ON eligibility
      FOR EACH ROW
      EXECUTE FUNCTION validate_eligible_values();
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS validate_eligible_values_trigger ON eligibility;
    `);

    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS validate_eligible_values();
    `);
  }
};

 