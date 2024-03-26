'use strict';
const nyc_neighborhoods = require("./Information Architecture - YourPeer - June '23 - Unduplicated zips.json")


/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => {
      return Promise.all([
        queryInterface.createTable('location_slugs', {
          slug: { 
            type: Sequelize.DataTypes.STRING,
            primaryKey: true
          },
          location_id: {
            type: Sequelize.DataTypes.UUID,
            references: {
              model: {
                tableName: 'locations',
              },
              key: 'id'
            }
          }
        }),
        queryInterface.createTable('location_slug_redirects', {
          slug: { 
            type: Sequelize.DataTypes.STRING,
            primaryKey: true
          },
          location_id: {
            type: Sequelize.DataTypes.UUID,
            references: {
              model: {
                tableName: 'locations',
              },
              key: 'id'
            }
          }
        }),
        queryInterface.createTable('nyc_neighborhoods', {
          zip_code: {
            type: Sequelize.DataTypes.STRING,
            primaryKey: true
          },
          neighborhood_name: { 
            type: Sequelize.DataTypes.STRING,
          },
          
        })
      ]).then(() => {
        return Promise.all(Object.entries(nyc_neighborhoods).
          map(([neighborhoodName, zipCodes]) => Promise.all(zipCodes.map(zipCode => 
            queryInterface.sequelize.query(
                `insert into nyc_neighborhoods values ($1, $2)`,
                { 
                  bind: [zipCode, neighborhoodName],
                  type: Sequelize.QueryTypes.INSERT 
                },
            )
          ))));
      }).then(() => {
        return queryInterface.sequelize.query(
          `insert into location_slug_redirects select slug, location_id from website_data`,
          { 
            type: Sequelize.QueryTypes.INSERT 
          }
        );
      }).then(() => {
        return queryInterface.sequelize.query(
          `
          create or replace function translate_slug_characters(slug varchar)
             returns varchar
             language plpgsql
            as
          $$
          begin
            return lower(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    trim(
                      both ' ' from slug
                    ),
                    '[^A-Za-z0-9 -]',
                    '',
                    'g'
                  ),
                  ' +',
                  '-',
                  'g'
                ),
                '-+',
                '-',
                'g'
              )
            );
          end;
          $$;
          `
        );
      }).then(() => {
        return queryInterface.sequelize.query(
          `
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
              from nyc_neighborhoods nycn inner join physical_addresses pa on nycn.zip_code = pa.postal_code
              where pa.location_id = loc_id;

              if org_name is not null then
                _slug := org_name; 
              END IF;

              if neighborhood is not null then
                _slug := _slug || ' ' || neighborhood; 
              END IF;

              _slug := translate_slug_characters(_slug);

              select count(1) into location_slug_count from location_slugs where location_slugs.slug = '/locations/' || _slug;

              RAISE NOTICE 'location_slug_count %, %', location_slug_count, _slug;

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
          `
        );
      }).then(() => {
        // populate the location_slugs table
        return queryInterface.sequelize.query(
          `
          DO $$DECLARE temprow record;
          BEGIN
            FOR temprow IN
                    SELECT id FROM locations 
                LOOP
                    INSERT INTO location_slugs(slug, location_id) VALUES (get_slug(temprow.id), temprow.id);
                    commit;
                END LOOP;
          END$$;
          `
        );
      });
    });
  },

  async down (queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => {
      return Promise.all([
        queryInterface.dropTable('location_slugs', { transaction: t }),
        queryInterface.dropTable('location_slug_redirects', { transaction: t }),
        queryInterface.dropTable('nyc_neighborhoods', { transaction: t }),
        queryInterface.dropFunction('get_slug', [{type: Sequelize.DataTypes.UUID}], { transaction: t }),
        queryInterface.dropFunction('translate_slug_characters', [{type: 'varchar'}], { transaction: t }),
      ]);
    });
  }
};
