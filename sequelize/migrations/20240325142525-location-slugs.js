
const nycNeighborhoods = require("./Information Architecture - YourPeer - June '23 - Unduplicated zips.json"); // eslint-disable-line max-len

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
      }),
      queryInterface.createTable('nyc_neighborhoods', {
        zip_code: {
          type: Sequelize.DataTypes.STRING,
          primaryKey: true,
        },
        neighborhood_name: {
          type: Sequelize.DataTypes.STRING,
        },

      }),
    ]).then(() => Promise.all(Object.entries(nycNeighborhoods)
      .map(([neighborhoodName, zipCodes]) => Promise.all(zipCodes.map(zipCode =>
        queryInterface.sequelize.query(
          'insert into nyc_neighborhoods values ($1, $2)',
          {
            bind: [zipCode, neighborhoodName],
            type: Sequelize.QueryTypes.INSERT,
          },
        )))))).then(() => (!isTesting ?
      queryInterface.sequelize.query(`
            insert into location_slug_redirects select slug, location_id from website_data`) :
      new Promise(resolve => resolve()))).then(() => queryInterface.sequelize.query(`
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
                -- logging
                FOR loc IN
                    SELECT * FROM locations 
                LOOP
                  RAISE LOG 'location: % % % % %',
                   loc.id,
                   loc.slug,
                   loc_id,
                   _slug,
                   loc.slug <> _slug;
                END LOOP;

              select count(1) into location_slug_count 
                from locations where locations.slug = _slug 
                and locations.id <> loc_id;

              RAISE LOG 'location_slug_count: %', location_slug_count;

              -- check if the slug exists in the location_slugs table
              return location_slug_count > 0;
          end;
          $$;
          `)
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
              neighborhood varchar;
              _slug_exists boolean;
              address_1 varchar;
              suffix_count int = 2;
            begin
              -- get the organization name
              select o.name into org_name from organizations o
              inner join locations l on l.organization_id = o.id
              where l.id = loc_id;

              -- get the area
              select neighborhood_name into neighborhood 
              from nyc_neighborhoods nycn 
                inner join physical_addresses pa on nycn.zip_code = pa.postal_code
              where pa.location_id = loc_id;

              if org_name is not null then
                _slug := org_name; 
              END IF;

              if neighborhood is not null then
                _slug := _slug || ' ' || neighborhood; 
              END IF;

              _slug := translate_slug_characters(_slug);

              RAISE LOG 'get_slug 1: % %', loc_id, _slug;

              _slug_exists := slug_exists(_slug, loc_id);

              RAISE LOG 'get_slug _slug_exists 2: % %', loc_id, _slug;

              -- check if the slug exists in the location_slugs table
              if _slug_exists then
                -- if it does exist, then get the address and append it
                select pa.address_1 into address_1 
                from physical_addresses pa 
                where pa.location_id = loc_id;

                RAISE LOG 'get_slug address_1 3: % %', loc_id, address_1;

                if address_1 is not null then
                  _slug := translate_slug_characters(_slug || ' ' || address_1);
                  RAISE LOG 'get_slug _slug 3: % % %', loc_id, address_1, _slug;
                end if;

              end if;

              slug_without_suffix_count := _slug;

              _slug_exists := slug_exists(_slug, loc_id);

              RAISE LOG 'get_slug _slug 4: % % %', loc_id, _slug_exists, _slug;

              if _slug_exists then

                -- check if the slug exists in the location_slugs table
                while _slug_exists loop

                  slug_with_suffix_count := 
                  translate_slug_characters(slug_without_suffix_count || ' ' || suffix_count);

                  
                  suffix_count := suffix_count + 1;

                  _slug_exists := slug_exists(slug_with_suffix_count, loc_id);

                  RAISE LOG 'get_slug loop 5: % % % %',
                   suffix_count,
                   slug_without_suffix_count,
                   slug_with_suffix_count,
                   _slug_exists;

                end loop;

                _slug := slug_with_suffix_count;

              end if;

              RAISE LOG 'final slug 5: % %', loc_id, _slug;

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
                    update locations set slug = get_slug(location_to_update.id)
                    where id = location_to_update.id;
                    commit;
                END LOOP;
          END$$;
          `))

        // setup triggers
        .then(() => queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_location_insert()
               returns trigger
               language plpgsql
              as
            $$
            begin
              RAISE LOG 'init_slug_on_location_insert: %', NEW.id;
              NEW.slug := get_slug(NEW.id);
              update locations set slug = NEW.slug
              where locations.id = NEW.id;
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
              new_slug uuid;
            begin

              RAISE LOG 'init_slug_on_organization_update: %', NEW.id;

              -- only update if organization.name has changed
              IF NEW.name <> OLD.name THEN
                -- look up all of the locations, and for each one, update the slug
                FOR location_to_update IN
                        SELECT id, slug FROM locations l where l.organization_id = NEW.id
                    LOOP

                        new_slug := get_slug(NEW.location_to_update.id);

                        IF new_slug <> old_slug THEN

                          -- TODO: populate location_slug_redirects table with the old value
                          -- insert into location_slug_redirects (slug, location_id)
                          --  values (slug, location_to_update.id);

                          -- update locations.slug column
                          update locations set slug = new_slug
                          where id = location_to_update.id;

                          commit;
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
              original_slug varchar;
              new_slug varchar;
            begin
              RAISE LOG 'init_slug_on_physical_addresses_update: %', NEW.id;

              -- only do update if the address field changes
              IF NEW.address_1 <> OLD.address_1 THEN

                select slug into original_slug from locations where locations.id = NEW.location_id;

                -- update locations.slug column
                new_slug := get_slug(NEW.location_id);

                IF new_slug <> old_slug THEN

                  -- populate location_slug_redirects table with the old value
                  -- insert into location_slug_redirects (slug, location_id)
                  --  values (original_slug, NEW.location_id);

                  update locations set slug = new_slug
                  where id = NEW.location_id;
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
              original_slug varchar;
              new_slug varchar;
            begin
              RAISE LOG 'init_slug_on_physical_addresses_insert: %', NEW.id;

              select slug into original_slug from locations where locations.id = NEW.location_id;

              new_slug := get_slug(NEW.location_id);

              IF new_slug <> original_slug THEN

                -- populate location_slug_redirects table with the old value
                -- insert into location_slug_redirects (slug, location_id)
                --  values (original_slug, NEW.location_id);

                -- update locations.slug column
                update locations set slug = get_slug(NEW.location_id)
                where id = NEW.location_id;

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
              RAISE LOG 'delete location: %', OLD.id;
              -- TODO
              -- delete from location_slug_redirects where location_id = OLD.id;
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
          `))));
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.removeColumn('locations', 'slug', { transaction: t }),
      queryInterface.dropTable('location_slug_redirects', { transaction: t }),
      queryInterface.dropTable('nyc_neighborhoods', { transaction: t }),
      queryInterface.dropFunction(
        'slug_exists',
        [{ type: Sequelize.DataTypes.STRING }],
        { transaction: t },
      ),
      queryInterface.dropFunction(
        'get_slug',
        [{ type: Sequelize.DataTypes.UUID }],
        { transaction: t },
      ),
      queryInterface.dropFunction(
        'translate_slug_characters',
        [{ type: 'varchar' }],
        { transaction: t },
      ),
      queryInterface.sequelize.query(
        'drop trigger init_slug_on_location_insert on locations',
        { transaction: t },
      ),
      queryInterface.dropFunction('do_init_slug_on_location_insert', [], { transaction: t }),
      queryInterface.sequelize.query(
        'drop trigger init_slug_on_organization_update on organizations',
        { transaction: t },
      ),
      queryInterface.dropFunction('do_init_slug_on_organization_update', [], { transaction: t }),
      queryInterface.sequelize.query(
        'drop trigger init_slug_on_physical_addresses_update on physical_addresses',
        { transaction: t },
      ),
      queryInterface.dropFunction(
        'do_init_slug_on_physical_addresses_update',
        [],
        { transaction: t },
      ),
      queryInterface.sequelize.query(
        'drop trigger delete_slug_on_location_delete on locations',
        { transaction: t },
      ),
      queryInterface.dropFunction('do_delete_slug_on_location_delete', [], { transaction: t }),
    ]));
  },
};
