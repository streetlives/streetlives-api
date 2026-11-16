// Delivery receipts only. Field values and attribution remain in metadata.
export default {
  up: queryInterface => queryInterface.sequelize.query(`
    CREATE TABLE metadata_event_deliveries (
      metadata_id uuid PRIMARY KEY REFERENCES metadata(id) ON DELETE CASCADE,
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX metadata_event_deliveries_pending
      ON metadata_event_deliveries (next_attempt_at, metadata_id)
      WHERE delivered_at IS NULL;
  `),
  down: queryInterface => queryInterface.sequelize.query('DROP TABLE metadata_event_deliveries'),
};
