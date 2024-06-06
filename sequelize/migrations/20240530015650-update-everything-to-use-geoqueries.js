
const isTesting = process.env.NODE_ENV === 'test';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // delete existing triggers that write to the neighborhood field
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS set_default_neighborhood_on_physical_address_insert_trigger 
        ON physical_addresses`);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS handle_set_default_neighborhood_on_physical_address_insert_trigger`);
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS set_default_neighborhood_on_physical_address_update_trigger 
        ON physical_addresses`);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS handle_set_default_neighborhood_on_physical_address_update_trigger`);
    // drop the neighborhood field
    await queryInterface.removeColumn('physical_addresses', 'neighborhood');
    // create a view that queries the neighborhood, district, etc.
    // primary key based on the location id. so that we can join to this view.
    await queryInterface.sequelize.query(`
      create or replace view locations_geocoded_metadata as 
        select l.id as location_id, 
          neighborhoods.*, 
          boroughs.*, 
          school_districts.school_district_id, 
          congressional_districts.congressional_district_id, 
          community_districts.community_district_id 
        from locations l,
          lateral (
                SELECT nng.neighborhood from nyc_neighborhood_geometries nng
                  where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) neighborhoods,
          lateral ( 
                SELECT nng.borough 
                   from nyc_neighborhood_geometries  nng
                   where ST_Contains(nng.geometry, ST_SetSRID(l.position, 4326))
          ) boroughs,
          lateral (
                SELECT  nd.district_id as school_district_id from nyc_districts nd
                  where 
                    ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'school'
          ) school_districts,
          lateral (
                SELECT nd.district_id as congressional_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'congressional'
          ) congressional_districts,
          lateral (
                SELECT nd.district_id as community_district_id from nyc_districts nd
                  where ST_Contains(nd.geometry, ST_SetSRID(l.position, 4326))
                    and nd.type = 'community'
          ) community_districts
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS locations_geocoded_metadata`
    );
    // create the neighborhood field
    await (!isTesting ?
      queryInterface.addColumn('physical_addresses', 'neighborhood', {
        type: Sequelize.DataTypes.STRING,
      }) :
      new Promise(resolve => resolve()));
    // create the triggers
    await queryInterface.sequelize.query(`
          create or replace function 
            handle_set_default_neighborhood_on_physical_address_insert_trigger()
             returns trigger
             language plpgsql
            as
          $$
          DECLARE 
            default_neighborhood varchar;
          begin

            SELECT neighborhood into default_neighborhood from 
              nyc_neighborhoods where 
                nyc_neighborhoods.zip_code = NEW.postal_code;

            NEW.neighborhood := default_neighborhood;
            return NEW;
          end;
          $$;

        CREATE TRIGGER set_default_neighborhood_on_physical_address_insert_trigger 
           BEFORE insert
           ON physical_addresses
           FOR EACH ROW
               EXECUTE PROCEDURE 
                 handle_set_default_neighborhood_on_physical_address_insert_trigger();


        create or replace function 
            handle_set_default_neighborhood_on_physical_address_update_trigger()
             returns trigger
             language plpgsql
            as
          $$
          DECLARE 
            default_neighborhood varchar;
          begin

            -- if we change his postal code, then reset his neighborhood to the default
            if NEW.postal_code <> OLD.postal_code and NEW.postal_code is not null then
              SELECT neighborhood into default_neighborhood from 
                nyc_neighborhoods where 
                  nyc_neighborhoods.zip_code = NEW.postal_code;

              UPDATE physical_addresses set neighborhood = default_neighborhood
                WHERE id = NEW.id;
            end if;
            return NEW;
          end;
          $$;

        CREATE TRIGGER set_default_neighborhood_on_physical_address_update_trigger 
           AFTER update
           ON physical_addresses
           FOR EACH ROW
               EXECUTE PROCEDURE 
                 handle_set_default_neighborhood_on_physical_address_update_trigger();

      `);
  },
};
