// Keep the existing get_slug naming algorithm. Only its ownership checks and
// refresh/capture triggers change; applying this migration does not rename rows.
const existingFunctions = reliable => `
  CREATE OR REPLACE FUNCTION slug_exists(_slug varchar, loc_id uuid)
  RETURNS boolean LANGUAGE plpgsql AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM locations WHERE slug = _slug AND id <> loc_id
    ) ${reliable ? `OR EXISTS (
      SELECT 1 FROM location_slug_redirects
      WHERE slug = _slug AND location_id IS DISTINCT FROM loc_id
    )` : ''};
  END;
  $$;

  CREATE OR REPLACE FUNCTION do_init_slug_on_organization_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    location_to_update record;
    new_slug varchar;
  BEGIN
    IF NEW.name ${reliable ? 'IS DISTINCT FROM' : '<>'} OLD.name THEN
      FOR location_to_update IN
        SELECT id, slug FROM locations WHERE organization_id = NEW.id
        ORDER BY created_at ASC${reliable ? ', id ASC' : ''}
      LOOP
        new_slug := get_slug(location_to_update.id);
        IF ${reliable ? 'new_slug IS DISTINCT FROM location_to_update.slug' :
    'location_to_update.slug IS NULL OR new_slug <> location_to_update.slug'} THEN
          PERFORM update_slug_on_location(new_slug, location_to_update.id);
        END IF;
      END LOOP;
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE OR REPLACE FUNCTION do_init_slug_on_physical_addresses_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    old_slug varchar;
    new_slug varchar;
  BEGIN
    IF NEW.address_1 ${reliable ? 'IS DISTINCT FROM' : '<>'} OLD.address_1
       ${reliable ? 'OR NEW.location_id IS DISTINCT FROM OLD.location_id' : ''} THEN
      SELECT slug INTO old_slug FROM locations WHERE id = NEW.location_id;
      new_slug := get_slug(NEW.location_id);
      IF ${reliable ? 'new_slug IS DISTINCT FROM old_slug' :
    'old_slug IS NULL OR new_slug <> old_slug'} THEN
        PERFORM update_slug_on_location(new_slug, NEW.location_id);
      END IF;
      ${reliable ? `IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN
        PERFORM update_slug_on_location(get_slug(OLD.location_id), OLD.location_id);
      END IF;` : ''}
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE OR REPLACE FUNCTION do_insert_into_location_slug_redirects_on_locations_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.slug IS NOT NULL AND ${reliable ? 'NEW.slug IS DISTINCT FROM OLD.slug' :
    `NEW.slug IS NOT NULL AND OLD.slug <> NEW.slug
      AND NOT EXISTS (SELECT 1 FROM location_slug_redirects WHERE slug = OLD.slug)`} THEN
      INSERT INTO location_slug_redirects (slug, location_id, created_at, updated_at)
      VALUES (OLD.slug, NEW.id, NOW(), NOW())
      ${reliable ? 'ON CONFLICT (slug) DO NOTHING' : ''};
      ${reliable ? `IF EXISTS (
        SELECT 1 FROM location_slug_redirects
        WHERE slug = OLD.slug AND location_id IS DISTINCT FROM NEW.id
      ) THEN
        RAISE EXCEPTION 'Historical slug % belongs to another location', OLD.slug
          USING ERRCODE = 'unique_violation';
      END IF;` : ''}
    END IF;
    RETURN NEW;
  END;
  $$;
`;

module.exports = {
  async up(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(existingFunctions(true), { transaction });
      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION guard_location_slug_owner()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.slug IS NOT NULL THEN
            -- Serialize claims to the same slug, including direct SQL changes.
            -- A concurrent generated collision fails instead of stealing an alias.
            PERFORM pg_advisory_xact_lock(1847391, hashtext(NEW.slug));
            IF slug_exists(NEW.slug, NEW.id) THEN
              RAISE EXCEPTION 'Slug % belongs to another location', NEW.slug
                USING ERRCODE = 'unique_violation';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$;

        CREATE TRIGGER guard_location_slug_owner
          BEFORE INSERT OR UPDATE OF slug ON locations
          FOR EACH ROW EXECUTE PROCEDURE guard_location_slug_owner();

        CREATE OR REPLACE FUNCTION do_init_slug_on_location_identity_update()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM update_slug_on_location(get_slug(NEW.id), NEW.id);
          RETURN NEW;
        END;
        $$;

        -- get_slug reads the geocoded neighborhood from the updated coordinates.
        -- Internal slug-only updates cannot re-enter this trigger.
        CREATE TRIGGER init_slug_on_location_identity_update
          AFTER UPDATE OF position, organization_id ON locations
          FOR EACH ROW
          WHEN (NEW.position::text IS DISTINCT FROM OLD.position::text
            OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
          EXECUTE PROCEDURE do_init_slug_on_location_identity_update();
      `, { transaction });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        DROP TRIGGER init_slug_on_location_identity_update ON locations;
        DROP FUNCTION do_init_slug_on_location_identity_update();
        DROP TRIGGER guard_location_slug_owner ON locations;
        DROP FUNCTION guard_location_slug_owner();
      `, { transaction });
      // Retain aliases captured while this migration was active.
      await queryInterface.sequelize.query(existingFunctions(false), { transaction });
    });
  },
};
