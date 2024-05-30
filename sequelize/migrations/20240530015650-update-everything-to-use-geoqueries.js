
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // update the locations.neighborhood database table
    await queryInterface.sequelize.transaction(async t => Promise.all([
      queryInterface.addColumn('physical_addresses', 'borough', {
        type: Sequelize.DataTypes.STRING,
      }),
      queryInterface.addColumn('physical_addresses', 'school_district', {
        type: Sequelize.DataTypes.INTEGER,
      }),
      queryInterface.addColumn('physical_addresses', 'congressional_district', {
        type: Sequelize.DataTypes.INTEGER,
      }),
      queryInterface.addColumn('physical_addresses', 'community_district', {
        type: Sequelize.DataTypes.INTEGER,
      }),
    ]));

    // clear existing neighborhoods
    await queryInterface.sequelize.query(`
      update physical_addresses
        set neighborhood = null, borough = null;
    `);

    // modify the trigger function in which the neighborhood
    // gets derived and set on the physical_addresses table
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE location_to_update record;
      BEGIN
        FOR location_to_update IN
                select pa.id, nng.neighborhood, nng.borough from
                physical_addresses pa
                inner join locations l on pa.location_id = l.id
                cross join nyc_neighborhood_geometries  nng
                where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
            LOOP
                update physical_addresses set 
                  neighborhood = location_to_update.neighborhood, 
                  borough = location_to_update.borough
                  where physical_addresses.id = location_to_update.id;
            END LOOP;
      END$$;
    `);

    // update the database trigger that keeps this up-to-date
    await queryInterface.sequelize.query(`
      create or replace function 
        handle_set_default_neighborhood_on_physical_address_insert_trigger()
         returns trigger
         language plpgsql
        as
      $$
      DECLARE 
        default_neighborhood varchar;
        default_borough varchar;
        default_school_district int;
        default_congressional_district int;
        default_community_district int;
      begin

        SELECT nng.neighborhood into default_neighborhood from
          locations l
          cross join nyc_neighborhood_geometries  nng
          where l.id = NEW.location_id 
          and ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326));

        SELECT nng.borough into default_borough from
          locations l
          cross join nyc_neighborhood_geometries  nng
          where l.id = NEW.location_id 
            and ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326));

        SELECT nd.district_id into default_school_district from
          locations l
          cross join nyc_districts nd
          where l.id = NEW.location_id 
            and ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
            and nd.type = 'school';

        SELECT nd.district_id into default_congressional_district from
          locations l
          cross join nyc_districts nd
          where l.id = NEW.location_id 
            and ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
            and nd.type = 'congressional';

        SELECT nd.district_id into default_community_district from
          locations l
          cross join nyc_districts nd
          where l.id = NEW.location_id 
            and ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
            and nd.type = 'community';

        NEW.neighborhood := default_neighborhood;
        NEW.borough := default_borough;
        NEW.school_district = default_school_district;
        NEW.congressional_district = default_congressional_district;
        NEW.community_district = default_community_district;
        return NEW;
      end;
      $$;
    `);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async t => Promise.all([
      queryInterface.removeColumn('physical_addresses', 'borough', { transaction: t }),
      queryInterface.removeColumn('physical_addresses', 'school_district', { transaction: t }),
      queryInterface.removeColumn(
        'physical_addresses',
        'congressional_district',
        { transaction: t },
      ),
      queryInterface.removeColumn('physical_addresses', 'community_district', { transaction: t }),
    ]));
  },
};
