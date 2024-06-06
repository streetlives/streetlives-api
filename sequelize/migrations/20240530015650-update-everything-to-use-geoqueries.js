
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
    // TODO: create a view that queries the neighborhood, district, etc.
    // primary key based on the location id. so that we can join to this view.
  },

  async down(queryInterface, Sequelize) {
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
