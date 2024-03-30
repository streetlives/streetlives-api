
const nycNeighborhoods = require("./Information Architecture - YourPeer - June '23 - Unduplicated zips.json"); // eslint-disable-line max-len

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.addColumn('locations', 'slug', {
        type: Sequelize.DataTypes.STRING,
      }),
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
        )))))).then(() => queryInterface.sequelize.query(
      'insert into location_slug_redirects select slug, location_id from website_data',
      {
        type: Sequelize.QueryTypes.INSERT,
      },
    )).then(() => queryInterface.sequelize.query(`
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
            create or replace function get_slug(loc_id uuid)
               returns varchar
               language plpgsql
              as
            $$
            declare 
               -- variable declaration
              _slug varchar;
              org_name varchar;
              neighborhood varchar;
              location_slug_count int;
              address_1 varchar;
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

              select count(1) into location_slug_count 
                from locations where locations.slug = '/locations/' || _slug;

              -- check if the slug exists in the location_slugs table
              if location_slug_count > 0 then
                -- if it does exist, then get the address and append it
                select pa.address_1 into address_1 
                from physical_addresses pa 
                where pa.location_id = loc_id;

                _slug := translate_slug_characters(_slug || ' ' || address_1);

              end if;

              return '/locations/' || _slug; 
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
      .then(() =>
        // then make the slug unique and not null
        queryInterface.changeColumn('locations', 'slug', {
          type: Sequelize.DataTypes.STRING,
          allowNull: false,
          unique: true,
        }))

      // setup triggers
      .then(() => queryInterface.sequelize.query(`
            create or replace function do_init_slug_on_location_insert()
               returns trigger
               language plpgsql
              as
            $$
            begin
              NEW.slug := get_slug(NEW.id);
              return NEW;
            end;
            $$;
          `))
      .then(() =>
        queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_location_insert 
             BEFORE insert
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
            DECLARE location_to_update record;
            begin
              -- look up all of the locations, and for each one, update the slug
              FOR location_to_update IN
                      SELECT id, slug FROM locations l where l.organization_id = NEW.id
                  LOOP
                      -- populate location_slug_redirects table with the old value
                      insert into location_slug_redirects (slug, location_id)
                        values (slug, location_to_update.id);

                      -- update locations.slug column
                      update locations set slug = get_slug(location_to_update.id)
                      where id = location_to_update.id;

                      commit;
                  END LOOP;
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
            DECLARE original_slug varchar;
            begin

              select slug into original_slug from locations where locations.id = NEW.location_id;

              -- populate location_slug_redirects table with the old value
              insert into location_slug_redirects (slug, location_id)
                values (original_slug, NEW.location_id);

              -- update locations.slug column
              update locations set slug = get_slug(NEW.location_id)
              where id = NEW.location_id;
              RETURN NEW;
            end;
            $$;
          `))
      .then(() =>
        queryInterface.sequelize.query(`
          CREATE TRIGGER init_slug_on_physical_addresses_update 
             AFTER update
             ON physical_addresses
             FOR EACH ROW
                 EXECUTE PROCEDURE do_init_slug_on_physical_addresses_update();
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
             AFTER delete
             ON locations
             FOR EACH  ROW
                 EXECUTE PROCEDURE do_delete_slug_on_location_delete();
          `)));
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => Promise.all([
      queryInterface.removeColumn('locations', 'slug', { transaction: t }),
      queryInterface.dropTable('location_slug_redirects', { transaction: t }),
      queryInterface.dropTable('nyc_neighborhoods', { transaction: t }),
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
