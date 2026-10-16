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
      await queryInterface.sequelize.query(`
        -- Old slug_exists ignored history, so a current canonical URL may already
        -- shadow another location's alias. Freeze claims until ownership is
        -- reconciled and the guard is installed in this same transaction.
        LOCK TABLE locations, location_slug_redirects IN SHARE ROW EXCLUSIVE MODE;

        DO $$ BEGIN
          IF EXISTS (SELECT slug FROM locations WHERE slug IS NOT NULL
                     GROUP BY slug HAVING COUNT(*) > 1) THEN
            RAISE EXCEPTION 'Duplicate canonical location slugs require manual reconciliation';
          END IF;
        END $$;

        -- No foreign keys: this evidence must survive deletion of either location.
        -- Keep the table on rollback, including across later reapplications.
        CREATE TABLE IF NOT EXISTS location_slug_redirect_conflicts (
          id bigserial PRIMARY KEY,
          slug varchar(255) NOT NULL,
          displaced_location_id uuid,
          canonical_location_id uuid NOT NULL,
          original_created_at timestamp with time zone,
          original_updated_at timestamp with time zone,
          reconciled_at timestamp with time zone NOT NULL DEFAULT NOW()
        );

        INSERT INTO location_slug_redirect_conflicts
          (slug, displaced_location_id, canonical_location_id,
           original_created_at, original_updated_at)
        SELECT history.slug, history.location_id, canonical.id,
          history.created_at, history.updated_at
        FROM location_slug_redirects history
        JOIN locations canonical ON canonical.slug = history.slug
        WHERE history.location_id IS DISTINCT FROM canonical.id
          AND NOT EXISTS (
            SELECT 1 FROM location_slug_redirect_conflicts archived
            WHERE archived.slug = history.slug
              AND archived.displaced_location_id IS NOT DISTINCT FROM history.location_id
              AND archived.canonical_location_id = canonical.id
              AND archived.original_created_at IS NOT DISTINCT FROM history.created_at
              AND archived.original_updated_at IS NOT DISTINCT FROM history.updated_at
          );

        -- The canonical route already won for this URL before the migration.
        -- Reserve it for that same location after its next rename as well.
        UPDATE location_slug_redirects history
        SET location_id = canonical.id, updated_at = NOW()
        FROM locations canonical
        WHERE canonical.slug = history.slug
          AND history.location_id IS DISTINCT FROM canonical.id;
      `, { transaction });
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
      // Retain aliases and the conflict archive. Restoring displaced claims would
      // resurrect the ambiguity (or redirect a renamed canonical URL elsewhere).
      await queryInterface.sequelize.query(existingFunctions(false), { transaction });
    });
  },
};
