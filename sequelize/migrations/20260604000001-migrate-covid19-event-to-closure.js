module.exports = {
  async up(queryInterface) {
    // The UPDATE fires the event_related_info trigger which stamps last_validated_at = NOW()
    // on affected locations. Capture only those location_ids via RETURNING, then
    // recalculate from metadata to restore correct values — leaving unrelated CLOSURE
    // locations untouched.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE loc_id uuid;
      BEGIN
        CREATE TEMP TABLE _affected_locations ON COMMIT DROP AS
          WITH updated AS (
            UPDATE event_related_info SET event = 'CLOSURE'
            WHERE event = 'COVID19' AND location_id IS NOT NULL
            RETURNING location_id
          )
          SELECT DISTINCT location_id FROM updated;

        FOR loc_id IN SELECT location_id FROM _affected_locations LOOP
          PERFORM update_last_validated_at_on_location(
            loc_id,
            get_last_validated_date_for_location(loc_id)
          );
        END LOOP;
      END$$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE loc_id uuid;
      BEGIN
        CREATE TEMP TABLE _affected_locations ON COMMIT DROP AS
          WITH updated AS (
            UPDATE event_related_info SET event = 'COVID19'
            WHERE event = 'CLOSURE' AND location_id IS NOT NULL
            RETURNING location_id
          )
          SELECT DISTINCT location_id FROM updated;

        FOR loc_id IN SELECT location_id FROM _affected_locations LOOP
          PERFORM update_last_validated_at_on_location(
            loc_id,
            get_last_validated_date_for_location(loc_id)
          );
        END LOOP;
      END$$;
    `);
  },
};
