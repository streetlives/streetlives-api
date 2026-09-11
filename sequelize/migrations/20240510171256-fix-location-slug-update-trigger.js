/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.query(`
        create or replace function handle_locations_update_trigger()
           returns trigger
           language plpgsql
          as
        $$
        begin
          if 
            (NEW.name <> OLD.name) OR
            (NEW.description <> OLD.description) OR
            (NEW.transportation <> OLD.transportation) OR
            (NOT (NEW.position ~= OLD.position)) OR
            (NEW.organization_id <> OLD.organization_id) OR
            (NEW.additional_info <> OLD.additional_info) 
            then
              PERFORM update_last_validated_at_on_locations(ARRAY[NEW.id]);
          end if;

          return NEW;
        end;
        $$;

        create or replace function handle_accessibility_for_disabilities_insert_update_trigger()
           returns trigger
           language plpgsql
          as
        $$
        begin
          PERFORM update_last_validated_at_on_locations(ARRAY[NEW.location_id]);

          return NEW;
        end;
        $$;
    `);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.query(`
        create or replace function handle_locations_update_trigger()
           returns trigger
           language plpgsql
          as
        $$
        begin
          if 
            (NEW.name <> OLD.name) OR
            (NEW.description <> OLD.description) OR
            (NEW.transportation <> OLD.transportation) OR
            (NOT (NEW.position ~= OLD.position)) OR
            (NEW.organization_id <> OLD.organization_id) OR
            (NEW.additional_info <> OLD.additional_info) 
            then
              PERFORM update_last_validated_at_on_locations(NEW.id);
          end if;

          return NEW;
        end;
        $$;

        create or replace function handle_accessibility_for_disabilities_insert_update_trigger()
           returns trigger
           language plpgsql
          as
        $$
        begin
          PERFORM update_last_validated_at_on_locations(NEW.location_id);

          return NEW;
        end;
        $$;
    `);
  },
};
