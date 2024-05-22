
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.sequelize.query(`
        alter table locations add name_vector tsvector 
          GENERATED ALWAYS AS (to_tsvector('english', name)) STORED
      `, { transaction: t }),

      queryInterface.sequelize.query(`
        alter table organizations add name_vector tsvector 
          GENERATED ALWAYS AS (to_tsvector('english', name)) STORED
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        alter table services add name_vector tsvector 
          GENERATED ALWAYS AS (to_tsvector('english', name)) STORED
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        alter table services add description_vector tsvector 
          GENERATED ALWAYS AS (to_tsvector('english', description)) STORED
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        alter table taxonomies add name_vector tsvector
          GENERATED ALWAYS AS (to_tsvector('english', name)) STORED
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        CREATE INDEX locations_name_vector ON locations USING GIN (name_vector)
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        CREATE INDEX organizations_name_vector ON organizations USING GIN (name_vector)
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        CREATE INDEX services_name_vector ON services USING GIN (name_vector)
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        CREATE INDEX services_description_vector ON services USING GIN (description_vector)
      `, { transaction: t }),
      queryInterface.sequelize.query(`
        CREATE INDEX taxonomies_name_vector ON taxonomies USING GIN (name_vector)
      `, { transaction: t }),
    ]));
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.removeColumn('locations', 'name_vector', { transaction: t }),
      queryInterface.removeColumn('organizations', 'name_vector', { transaction: t }),
      queryInterface.removeColumn('services', 'name_vector', { transaction: t }),
      queryInterface.removeColumn('services', 'description_vector', { transaction: t }),
      queryInterface.removeColumn('taxonomies', 'name_vector', { transaction: t }),
    ]));
  },
};
