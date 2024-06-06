
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
    await queryInterface.sequelize.query(`
            create or replace function get_slug(loc_id uuid)
               returns varchar
               language plpgsql
              as
            $$
            declare 
               -- variable declaration
              _slug varchar;
              slug_with_suffix_count varchar;
              slug_without_suffix_count varchar;
              org_name varchar;
              _neighborhood varchar;
              _slug_exists boolean;
              address_1 varchar;
              suffix_count int = 2;
            begin
              -- first check if he has a physical_address associated with him.
              -- if he does not, then return null
              if not exists (select * from physical_addresses where location_id = loc_id) then
                RAISE LOG
                  'location % does not yet have a physical address initialized. skipping...',
                  loc_id;
                return null;
              end if;

              -- get the organization name
              select o.name into org_name from organizations o
              inner join locations l on l.organization_id = o.id
              where l.id = loc_id;

              -- get the area
              select neighborhood into _neighborhood 
              from locations_geocoded_metadata where location_id = loc_id;

              if org_name is not null then
                _slug := org_name; 
              END IF;

              if _neighborhood is not null then
                _slug := _slug || ' ' || _neighborhood; 
              END IF;

              _slug := translate_slug_characters(_slug);

              _slug_exists := slug_exists(_slug, loc_id);

              -- check if the slug exists in the location_slugs table
              if _slug_exists then
                -- if it does exist, then get the address and append it
                select pa.address_1 into address_1 
                from physical_addresses pa 
                where pa.location_id = loc_id;

                if address_1 is not null then
                  _slug := translate_slug_characters(_slug || ' ' || address_1);
                end if;

              end if;

              slug_without_suffix_count := _slug;

              _slug_exists := slug_exists(_slug, loc_id);

              if _slug_exists then

                -- check if the slug exists in the location_slugs table
                while _slug_exists loop

                  slug_with_suffix_count := 
                  translate_slug_characters(slug_without_suffix_count || ' ' || suffix_count);

                  
                  suffix_count := suffix_count + 1;

                  _slug_exists := slug_exists(slug_with_suffix_count, loc_id);

                end loop;

                _slug := slug_with_suffix_count;

              end if;

              return _slug; 
            end;
            $$;
          `);
    await queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_physical_addresses_update()
               returns trigger
               language plpgsql
              as
            $$
            DECLARE 
              old_slug varchar;
              new_slug varchar;
            begin
              -- only do update if the address field changes
              IF NEW.address_1 <> OLD.address_1 THEN

                select slug into old_slug from locations where locations.id = NEW.location_id;

                -- update locations.slug column
                new_slug := get_slug(NEW.location_id);

                IF (old_slug is null) or (new_slug <> old_slug) THEN

                  PERFORM update_slug_on_location(new_slug, NEW.location_id);

                END IF;

              END IF;
              RETURN NEW;
            end;
            $$;
          `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_physical_addresses_update()
               returns trigger
               language plpgsql
              as
            $$
            DECLARE 
              old_slug varchar;
              new_slug varchar;
            begin
              -- only do update if the address field changes
              IF NEW.address_1 <> OLD.address_1 OR 
                  NEW.postal_code <> OLD.postal_code OR 
                  NEW.neighborhood <> OLD.neighborhood
                  THEN

                select slug into old_slug from locations where locations.id = NEW.location_id;

                -- update locations.slug column
                new_slug := get_slug(NEW.location_id);

                IF (old_slug is null) or (new_slug <> old_slug) THEN

                  PERFORM update_slug_on_location(new_slug, NEW.location_id);

                END IF;

              END IF;
              RETURN NEW;
            end;
            $$;
          `);
    await queryInterface.sequelize.query(`
            create or replace function get_slug(loc_id uuid)
               returns varchar
               language plpgsql
              as
            $$
            declare 
               -- variable declaration
              _slug varchar;
              slug_with_suffix_count varchar;
              slug_without_suffix_count varchar;
              org_name varchar;
              _neighborhood varchar;
              _slug_exists boolean;
              address_1 varchar;
              suffix_count int = 2;
            begin
              -- first check if he has a physical_address associated with him.
              -- if he does not, then return null
              if not exists (select * from physical_addresses where location_id = loc_id) then
                RAISE LOG
                  'location % does not yet have a physical address initialized. skipping...',
                  loc_id;
                return null;
              end if;

              -- get the organization name
              select o.name into org_name from organizations o
              inner join locations l on l.organization_id = o.id
              where l.id = loc_id;

              -- get the area
              select neighborhood into _neighborhood 
              from physical_addresses pa 
              where pa.location_id = loc_id;

              if org_name is not null then
                _slug := org_name; 
              END IF;

              if _neighborhood is not null then
                _slug := _slug || ' ' || _neighborhood; 
              END IF;

              _slug := translate_slug_characters(_slug);

              _slug_exists := slug_exists(_slug, loc_id);

              -- check if the slug exists in the location_slugs table
              if _slug_exists then
                -- if it does exist, then get the address and append it
                select pa.address_1 into address_1 
                from physical_addresses pa 
                where pa.location_id = loc_id;

                if address_1 is not null then
                  _slug := translate_slug_characters(_slug || ' ' || address_1);
                end if;

              end if;

              slug_without_suffix_count := _slug;

              _slug_exists := slug_exists(_slug, loc_id);

              if _slug_exists then

                -- check if the slug exists in the location_slugs table
                while _slug_exists loop

                  slug_with_suffix_count := 
                  translate_slug_characters(slug_without_suffix_count || ' ' || suffix_count);

                  
                  suffix_count := suffix_count + 1;

                  _slug_exists := slug_exists(slug_with_suffix_count, loc_id);

                end loop;

                _slug := slug_with_suffix_count;

              end if;

              return _slug; 
            end;
            $$;
          `);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS locations_geocoded_metadata`);
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
