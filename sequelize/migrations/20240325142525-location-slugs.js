
const nycNeighborhoods = require("./Information Architecture - YourPeer - June '23 - Unduplicated zips.json"); // eslint-disable-line max-len
const mergedNeighborhoodNames = require('./20231229 Location Area Updates - all_test_locations_data_2.json'); // eslint-disable-line max-len

const mergedNeighborhoodNamesByLocationId = {};
mergedNeighborhoodNames.forEach((o) => {
  mergedNeighborhoodNamesByLocationId[o['gogetta /find_url'].split('/').pop()] = o.merged_area;
});

const isTesting = process.env.NODE_ENV === 'test';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      !isTesting ?
        queryInterface.addColumn('locations', 'slug', {
          type: Sequelize.DataTypes.STRING,
        }) :
        new Promise(resolve => resolve()),
      queryInterface.addIndex('locations', ['slug']),
      queryInterface.createTable('location_slug_redirects', {
        slug: {
          type: Sequelize.DataTypes.STRING,
          primaryKey: true,
        },
        location_id: {
          type: Sequelize.DataTypes.UUID,
          references: {
            model: {
              tableName: 'locations',
            },
            key: 'id',
          },
        },
        created_at: {
          type: Sequelize.DataTypes.DATE,
        },
        updated_at: {
          type: Sequelize.DataTypes.DATE,
        },
      }),
      queryInterface.createTable('nyc_neighborhoods', {
        zip_code: {
          type: Sequelize.DataTypes.STRING,
          primaryKey: true,
        },
        neighborhood: {
          type: Sequelize.DataTypes.STRING,
        },

      }),
    ]).then(() => Promise.all(Object.entries(nycNeighborhoods)
      .map(([neighborhood, zipCodes]) => Promise.all(zipCodes.map(zipCode =>
        queryInterface.sequelize.query(
          'insert into nyc_neighborhoods values ($1, $2)',
          {
            bind: [zipCode, neighborhood],
            type: Sequelize.QueryTypes.INSERT,
          },
        ))))))

      // add support for manually-set neighborhood name for each physical location
      // add neighborhood field to physical_addresses table
      .then(() => queryInterface.addColumn('physical_addresses', 'neighborhood', {
        type: Sequelize.DataTypes.STRING,
      }))
      // initialize new physical_address.neighborhood field from the spreadsheet
      .then(() => Promise.all(Object.entries(mergedNeighborhoodNamesByLocationId)
        .map(([locationId, neighborhood]) =>
          queryInterface.sequelize.query(
            'update physical_addresses set neighborhood = $1 where location_id = $2',
            {
              bind: [neighborhood, locationId],
              type: Sequelize.QueryTypes.INSERT,
            },
          ))))
      // Fill in the remaining gaps
      .then(() =>
        queryInterface.sequelize.query(`
        DO $$
        DECLARE 
          physical_address_to_update record;
          default_neighborhood varchar;
        BEGIN
          FOR physical_address_to_update IN
                  SELECT id, postal_code FROM physical_addresses
                    WHERE neighborhood IS NULL
              LOOP

                SELECT neighborhood into default_neighborhood from 
                  nyc_neighborhoods where 
                    nyc_neighborhoods.zip_code = physical_address_to_update.postal_code;

                UPDATE physical_addresses set neighborhood = default_neighborhood
                  WHERE id = physical_address_to_update.id;

              END LOOP;
        END$$;
        `))
      // write the trigger that will set a default value on the record to insert
      .then(() =>
        queryInterface.sequelize.query(`
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

        `))

      // slugs
      .then(() => queryInterface.sequelize.query(`
          create or replace function translate_slug_characters(slug varchar)
             returns varchar
             language plpgsql
            as
          $$
          begin
            return lower(
              regexp_replace(
                regexp_replace(
                  trim(
                    both ' ' from slug
                  ),
                  '[^A-Za-z0-9 -]',
                  '',
                  'g'
                ),
                '[ -]+',
                '-',
                'g'
              )
            );
          end;
          $$;
          `))
      .then(() => queryInterface.sequelize.query(`
          create or replace function slug_exists(_slug varchar, loc_id uuid)
             returns boolean
             language plpgsql
            as
          $$
            declare 
              location_slug_count int;
              loc record;
          begin
              return exists(
                select * 
                from locations where locations.slug = _slug 
                and locations.id <> loc_id
              );
          end;
          $$;
          `)
        .then(() => queryInterface.sequelize.query(`
          create or replace function update_slug_on_location(_slug varchar, loc_id uuid)
             returns void
             language plpgsql
            as
          $$
          begin
            if _slug is not null then
              update locations set slug = _slug where id = loc_id;
            end if;
          end;
          $$;
          `))
        .then(() => queryInterface.sequelize.query(`
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
          `))
        .then(() =>
        // populate the locations.slug table
          queryInterface.sequelize.query(`
          DO $$
          DECLARE location_to_update record;
          BEGIN
            FOR location_to_update IN
                    SELECT id FROM locations
                LOOP
                    PERFORM update_slug_on_location(
                      get_slug(location_to_update.id), 
                      location_to_update.id
                    );
                    commit;
                END LOOP;
          END$$;
          `))
        .then(() => (!isTesting ?
          queryInterface.sequelize.query(`
              DO $$
              DECLARE 
                _slug varchar;
                data record;
              BEGIN
                FOR data IN SELECT slug, location_id FROM website_data
                  LOOP
                    _slug := (string_to_array(data.slug,'/'))[3];
                    if not exists(select slug from locations where slug = _slug) then
                      insert into location_slug_redirects values (
                        _slug, 
                        data.location_id, 
                        now(), 
                        now());
                      end if;
                  END LOOP;
              END$$;
          `) :
          new Promise(resolve => resolve())))
        // setup triggers
        .then(() => queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_location_insert()
               returns trigger
               language plpgsql
              as
            $$
            begin
              NEW.slug := get_slug(NEW.id);
              PERFORM update_slug_on_location(NEW.slug, NEW.id);
              return NEW;
            end;
            $$;
          `))
        .then(() =>
          queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_location_insert 
             AFTER insert
             ON locations
             FOR EACH  ROW
                 EXECUTE PROCEDURE do_init_slug_on_location_insert();
          `))
        // update organization trigger
        .then(() => queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_organization_update()
               returns trigger
               language plpgsql
              as
            $$
            DECLARE 
              location_to_update record;
              new_slug varchar;
              old_slug varchar;
            begin

              -- only update if organization.name has changed
              IF NEW.name <> OLD.name THEN
                -- look up all of the locations, and for each one, update the slug
                FOR location_to_update IN
                        SELECT id, slug FROM locations l 
                        where l.organization_id = NEW.id
                        order by l.created_at ASC
                    LOOP

                        new_slug := get_slug(location_to_update.id);
                        old_slug := location_to_update.slug;

                        IF (old_slug is null) or (new_slug <> old_slug)  THEN
                          PERFORM update_slug_on_location(new_slug, location_to_update.id);
                        END IF;
                    END LOOP;
                END IF;
              RETURN NEW;
            end;
            $$;
          `))
        .then(() =>
          queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_organization_update 
             AFTER update
             ON organizations
             FOR EACH ROW
                 EXECUTE PROCEDURE do_init_slug_on_organization_update();
          `))
        // update physical_addresses trigger
        .then(() => queryInterface.sequelize.query(`
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
          `))
        // update physical_addresses trigger
        .then(() =>
          queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_physical_addresses_update 
             AFTER update
             ON physical_addresses
             FOR EACH ROW
                 EXECUTE PROCEDURE do_init_slug_on_physical_addresses_update();
          `))

        // create physical_addresses trigger
        .then(() => queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_physical_addresses_insert()
               returns trigger
               language plpgsql
              as
            $$
            DECLARE 
              old_slug varchar;
              new_slug varchar;
            begin
              select slug into old_slug from locations where locations.id = NEW.location_id;

              new_slug := get_slug(NEW.location_id);

              IF (old_slug is null) or (new_slug <> old_slug) THEN

                -- update locations.slug column
                PERFORM update_slug_on_location(new_slug, NEW.location_id);

              END IF;

              RETURN NEW;
            end;
            $$;
          `))
        .then(() =>
          queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_physical_addresses_insert 
             AFTER insert
             ON physical_addresses
             FOR EACH ROW
                 EXECUTE PROCEDURE do_init_slug_on_physical_addresses_insert();
          `))

        // delete trigger
        .then(() => queryInterface.sequelize.query(`
            create or replace function do_delete_slug_on_location_delete()
               returns trigger
               language plpgsql
              as
            $$
            begin
              delete from location_slug_redirects where location_id = OLD.id;
              return OLD;
            end;
            $$;
          `))
        .then(() =>
          queryInterface.sequelize.query(`
          CREATE TRIGGER delete_slug_on_location_delete 
             BEFORE delete
             ON locations
             FOR EACH  ROW
                 EXECUTE PROCEDURE do_delete_slug_on_location_delete();
          `)))
      .then(() => queryInterface.sequelize.query(`
            create or replace function do_insert_into_location_slug_redirects_on_locations_update()
               returns trigger
               language plpgsql
              as
            $$
            begin

              IF OLD.slug is not null and NEW.slug is not null and OLD.slug <> NEW.slug
                AND NOT EXISTS(select * from location_slug_redirects where slug = OLD.slug) THEN

                insert into location_slug_redirects(slug, location_id, created_at, updated_at) 
                  values (OLD.slug, NEW.id, NOW(), NOW());
              END IF;
              RETURN NEW;
            end;
            $$;
          `))
      .then(() =>
        queryInterface.sequelize.query(`
          CREATE TRIGGER insert_into_location_slug_redirects_on_locations_update
             AFTER update
             ON locations
             FOR EACH ROW
                 EXECUTE PROCEDURE do_insert_into_location_slug_redirects_on_locations_update();
          `))
      .then(() =>
        queryInterface.sequelize.query(`
          create index metadata_resource_id on metadata(resource_id)
          `))
      .then(() =>
        queryInterface.sequelize.query(`
          create index metadata_resource_table on metadata(resource_table);
          `))
      // feature to populate last_validated_at
      // add column to locations called last_validated_at
      .then(() =>
        (!isTesting ?
          queryInterface.addColumn('locations', 'last_validated_at', {
            type: Sequelize.DataTypes.DATE,
          }) :
          new Promise(resolve => resolve())))
      // add function to compute last_validated_at.
      .then(() =>
        queryInterface.sequelize.query(`
          create or replace function get_last_validated_date_for_location(_location_id uuid)
             returns timestamp with time zone
             language sql
            as
          $$
    select max(metadata.created_at) as "lastValidatedDateForLocation"
    from locations
    left join service_at_locations sal on sal.location_id = locations.id
    left join services on sal.service_id = services.id
    left join service_languages on service_languages.service_id = services.id
    left join holiday_schedules on holiday_schedules.service_id = services.id
    left join service_areas on service_areas.service_id = services.id
    left join eligibility on eligibility.service_id = services.id
    left join service_taxonomy_specific_attributes 
      on service_taxonomy_specific_attributes.service_id = services.id
    left join required_documents on required_documents.service_id = services.id
    left join documents_infos on documents_infos.service_id = services.id
    left join phones on (phones.service_id = services.id or phones.location_id = locations.id)
    left join event_related_info on 
      (event_related_info.service_id = services.id or 
        event_related_info.location_id = locations.id)
    left join accessibility_for_disabilities on 
      accessibility_for_disabilities.location_id = locations.id
    join metadata on (
      (metadata.resource_table = 'locations' 
        and metadata.resource_id = locations.id) or
      (metadata.resource_table = 'accessibility_for_disabilities' and 
        metadata.resource_id = accessibility_for_disabilities.id) or
      (metadata.resource_table = 'service_languages' and 
        metadata.resource_id = service_languages.id) or
      (metadata.resource_table = 'holiday_schedules' and 
        metadata.resource_id = holiday_schedules.id) or
      (metadata.resource_table = 'service_areas' and 
        metadata.resource_id = service_areas.id) or
      (metadata.resource_table = 'eligibility' and 
        metadata.resource_id = eligibility.id) or
      (metadata.resource_table = 'service_taxonomy_specific_attributes' and 
        metadata.resource_id = service_taxonomy_specific_attributes.id) or
      (metadata.resource_table = 'required_documents' and 
        metadata.resource_id = required_documents.id) or
      (metadata.resource_table = 'documents_infos' and 
        metadata.resource_id = documents_infos.id) or
      (metadata.resource_table = 'phones' and 
        metadata.resource_id = phones.id) or
      (metadata.resource_table = 'event_related_info' and 
        metadata.resource_id = event_related_info.id) or
      (metadata.resource_table = 'services' and 
        metadata.resource_id = services.id)
    )
    where locations.id = _location_id
          $$
          `))
      // populate new column on existing location tables
      .then(() => queryInterface.sequelize.query(`
        create or replace function update_last_validated_at_on_location(
          loc_id uuid, 
          _last_validated_at timestamp with time zone default null
        )
           returns void
           language plpgsql
          as
        $$
        begin
          update locations set last_validated_at = (
            CASE
              when _last_validated_at is null then NOW()
              else _last_validated_at
            end
          ) 
          where id = loc_id;
        end;
        $$;
        `))
      .then(() =>
        queryInterface.sequelize.query(`
        DO $$
        DECLARE location_to_update record;
        BEGIN
          FOR location_to_update IN
                  SELECT id FROM locations
              LOOP
                  PERFORM update_last_validated_at_on_location(
                    location_to_update.id,
                    get_last_validated_date_for_location(location_to_update.id)
                  );
                  commit;
              END LOOP;
        END$$;
        `))
      // add triggers for each dependent table that will run on CUD
      .then(() =>
        queryInterface.sequelize.query(`
            create or replace function update_last_validated_at_on_locations(location_ids uuid[])
               returns void
               language plpgsql
              as
            $$
            declare 
              location_id uuid;
            begin
              IF location_ids IS NOT NULL THEN
                FOREACH location_id IN array location_ids
                LOOP
                  PERFORM update_last_validated_at_on_location(location_id);
                END LOOP;
              end if;
            end;
            $$;


            -- services
            create or replace function handle_services_insert_update_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin
              PERFORM update_last_validated_at_on_locations(
                  (
                    select array_agg(sal.location_id) 
                      from service_at_locations sal
                      where sal.service_id = NEW.id
                  )
                );
              return NEW;
            end;
            $$;

            CREATE TRIGGER services_insert_trigger 
               AFTER insert
               ON services
               FOR EACH ROW
                   EXECUTE PROCEDURE handle_services_insert_update_trigger();

            CREATE TRIGGER services_update_trigger 
               AFTER UPDATE
               ON services
               FOR EACH ROW
                   EXECUTE PROCEDURE handle_services_insert_update_trigger();


          -- service_at_locations
            create or replace function handle_service_at_locations_insert_update_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin
              PERFORM update_last_validated_at_on_locations(
                  (
                    select array_agg(sal.location_id) 
                    from service_at_locations sal
                    where sal.id = NEW.id
                  )
                );
              return NEW;
            end;
            $$;

          CREATE TRIGGER service_at_locations_insert_trigger 
             AFTER insert
             ON service_at_locations
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_service_at_locations_insert_update_trigger();

          CREATE TRIGGER service_at_locations_update_trigger 
             AFTER UPDATE
             ON service_at_locations
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_service_at_locations_insert_update_trigger();


          -- everything that has a service_id only
            create or replace function handle_everything_with_service_id_insert_update_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin
              PERFORM update_last_validated_at_on_locations(
                  (
                    select array_agg(sal.location_id) 
                    from service_at_locations sal
                    where sal.service_id = NEW.service_id
                  )
                );
              return NEW;
            end;
            $$;


          -- service_languages

          CREATE TRIGGER service_languages_insert_trigger 
             AFTER insert
             ON service_languages
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER service_languages_update_trigger 
             AFTER UPDATE
             ON service_languages
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();



          -- holiday_schedules
          CREATE TRIGGER holiday_schedules_insert_trigger 
             AFTER insert
             ON holiday_schedules
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER holiday_schedules_update_trigger 
             AFTER UPDATE
             ON holiday_schedules
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();


          -- service_areas
          CREATE TRIGGER service_areas_insert_trigger 
             AFTER insert
             ON service_areas
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER service_areas_update_trigger 
             AFTER UPDATE
             ON service_areas
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();


          -- eligibility
          CREATE TRIGGER eligibility_insert_trigger 
             AFTER insert
             ON eligibility
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER eligibility_update_trigger 
             AFTER UPDATE
             ON eligibility
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();


          -- service_taxonomy_specific_attributes
          CREATE TRIGGER service_taxonomy_specific_attributes_insert_trigger 
             AFTER insert
             ON service_taxonomy_specific_attributes
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER service_taxonomy_specific_attributes_update_trigger 
             AFTER UPDATE
             ON service_taxonomy_specific_attributes
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();



          -- required_documents
          CREATE TRIGGER required_documents_insert_trigger 
             AFTER insert
             ON required_documents
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER required_documents_update_trigger 
             AFTER UPDATE
             ON required_documents
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();



          -- documents_infos
          CREATE TRIGGER documents_infos_insert_trigger 
             AFTER insert
             ON documents_infos
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();

          CREATE TRIGGER documents_infos_update_trigger 
             AFTER UPDATE
             ON documents_infos
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_everything_with_service_id_insert_update_trigger();




          -- phones
            create or replace function handle_phones_insert_update_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin
              PERFORM update_last_validated_at_on_locations(
                (
                  select array_agg(sal.location_id) 
                      from service_at_locations sal 
                      where sal.service_id = NEW.service_id
                ) ||
                ARRAY[NEW.location_id]
              );

              return NEW;
            end;
            $$;

          CREATE TRIGGER phones_insert_trigger 
             AFTER insert
             ON phones
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_phones_insert_update_trigger();

          CREATE TRIGGER phones_update_trigger 
             AFTER UPDATE
             ON phones
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_phones_insert_update_trigger();



          -- event_related_info
            create or replace function handle_event_related_info_insert_update_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin

              PERFORM update_last_validated_at_on_locations(
                (
                  select array_agg(sal.location_id) 
                      from service_at_locations sal 
                      where sal.service_id = NEW.service_id
                ) || 
                ARRAY[NEW.location_id]
              );

              return NEW;
            end;
            $$;

          CREATE TRIGGER event_related_info_insert_trigger 
             AFTER insert
             ON event_related_info
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_event_related_info_insert_update_trigger();

          CREATE TRIGGER event_related_info_update_trigger 
             AFTER UPDATE
             ON event_related_info
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_event_related_info_insert_update_trigger();



          -- accessibility_for_disabilities
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

          CREATE TRIGGER accessibility_for_disabilities_insert_trigger 
             AFTER insert
             ON accessibility_for_disabilities
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_accessibility_for_disabilities_insert_update_trigger();

          CREATE TRIGGER accessibility_for_disabilities_update_trigger 
             AFTER UPDATE
             ON accessibility_for_disabilities
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_accessibility_for_disabilities_insert_update_trigger();


          -- locations
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

            create or replace function handle_locations_insert_trigger()
               returns trigger
               language plpgsql
              as
            $$
            begin
              NEW.last_validated_at := NOW();
              return NEW;
            end;
            $$;

          CREATE TRIGGER locations_insert_trigger 
             BEFORE insert
             ON locations
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_locations_insert_trigger();

          CREATE TRIGGER locations_update_trigger 
             AFTER UPDATE
             ON locations
             FOR EACH ROW
                 EXECUTE PROCEDURE handle_locations_update_trigger();

                 `)));
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.query(`
      alter table locations drop column slug;
      drop table location_slug_redirects cascade;
      drop table nyc_neighborhoods cascade;

      alter table physical_addresses drop column neighborhood;
      drop trigger 
          set_default_neighborhood_on_physical_address_insert_trigger on physical_addresses;
      drop function handle_set_default_neighborhood_on_physical_address_insert_trigger;
      drop trigger 
          set_default_neighborhood_on_physical_address_update_trigger on physical_addresses;
      drop function handle_set_default_neighborhood_on_physical_address_update_trigger;

      drop function slug_exists(varchar, uuid);
      drop function get_slug(uuid);
      drop function translate_slug_characters(varchar);
      drop function update_slug_on_location(varchar, uuid);
      drop trigger init_slug_on_location_insert on locations;
      drop function do_init_slug_on_location_insert;
      drop trigger init_slug_on_organization_update on organizations;
      drop function do_init_slug_on_organization_update;
      drop trigger init_slug_on_physical_addresses_update on physical_addresses;
      drop function do_init_slug_on_physical_addresses_update;
      drop trigger delete_slug_on_location_delete on locations;
      drop function do_delete_slug_on_location_delete;
      drop trigger insert_into_location_slug_redirects_on_locations_update on locations;
      drop function do_insert_into_location_slug_redirects_on_locations_update;
      drop trigger init_slug_on_physical_addresses_insert on physical_addresses;
      drop function do_init_slug_on_physical_addresses_insert;

      drop index metadata_resource_id;
      drop index metadata_resource_table;

      alter table locations drop column last_validated_at;
      drop function get_last_validated_date_for_location;
      drop function update_last_validated_at_on_locations(location_ids uuid[]);
      drop function update_last_validated_at_on_location;

      DROP TRIGGER services_insert_trigger on services; 
      DROP TRIGGER services_update_trigger on services;
      DROP TRIGGER service_at_locations_insert_trigger on service_at_locations;
      DROP TRIGGER service_at_locations_update_trigger on service_at_locations;
      DROP TRIGGER service_languages_insert_trigger on service_languages; 
      DROP TRIGGER service_languages_update_trigger on service_languages;
      DROP TRIGGER holiday_schedules_insert_trigger on holiday_schedules;
      DROP TRIGGER holiday_schedules_update_trigger on holiday_schedules; 
      DROP TRIGGER service_areas_insert_trigger on service_areas; 
      DROP TRIGGER service_areas_update_trigger on service_areas; 
      DROP TRIGGER eligibility_insert_trigger on eligibility; 
      DROP TRIGGER eligibility_update_trigger on eligibility; 
      DROP TRIGGER service_taxonomy_specific_attributes_insert_trigger 
        on service_taxonomy_specific_attributes; 
      DROP TRIGGER service_taxonomy_specific_attributes_update_trigger 
        on service_taxonomy_specific_attributes; 
      DROP TRIGGER required_documents_insert_trigger on required_documents; 
      DROP TRIGGER required_documents_update_trigger on required_documents; 
      DROP TRIGGER documents_infos_insert_trigger on documents_infos; 
      DROP TRIGGER documents_infos_update_trigger on documents_infos; 
      DROP TRIGGER phones_insert_trigger on phones; 
      DROP TRIGGER phones_update_trigger on phones; 
      DROP TRIGGER event_related_info_insert_trigger on event_related_info; 
      DROP TRIGGER event_related_info_update_trigger on event_related_info; 
      DROP TRIGGER accessibility_for_disabilities_insert_trigger on accessibility_for_disabilities; 
      DROP TRIGGER accessibility_for_disabilities_update_trigger on accessibility_for_disabilities;
      DROP TRIGGER locations_insert_trigger on locations;
      DROP TRIGGER locations_update_trigger on locations; 

      DROP FUNCTION handle_services_insert_update_trigger();
      DROP FUNCTION handle_service_at_locations_insert_update_trigger();
      DROP FUNCTION handle_phones_insert_update_trigger();
      DROP FUNCTION handle_event_related_info_insert_update_trigger();
      DROP FUNCTION handle_accessibility_for_disabilities_insert_update_trigger();
      DROP FUNCTION handle_locations_insert_trigger();
    `);
  },
};
