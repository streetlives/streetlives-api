module.exports = {
  async up(queryInterface) {
    // The UPDATE fires the event_related_info trigger which stamps last_validated_at = NOW()
    // on affected locations. Immediately recalculate from metadata to restore correct values.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE loc_id uuid;
      BEGIN
        UPDATE event_related_info SET event = 'CLOSURE'
        WHERE event = 'COVID19' AND location_id IS NOT NULL;

        FOR loc_id IN
          SELECT DISTINCT location_id
          FROM event_related_info
          WHERE event = 'CLOSURE' AND location_id IS NOT NULL
        LOOP
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
        UPDATE event_related_info SET event = 'COVID19'
        WHERE event = 'CLOSURE' AND location_id IS NOT NULL;

        FOR loc_id IN
          SELECT DISTINCT location_id
          FROM event_related_info
          WHERE event = 'COVID19' AND location_id IS NOT NULL
        LOOP
          PERFORM update_last_validated_at_on_location(
            loc_id,
            get_last_validated_date_for_location(loc_id)
          );
        END LOOP;
      END$$;
    `);
  },
};
