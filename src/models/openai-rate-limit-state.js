// Shared state for the cross-instance guards around the paid OpenAI
// natural-language-search call. In Lambda each concurrent instance is its own
// process, so purely in-memory limits are per-instance and don't bound total
// cost/abuse. This single-row table (keyed by a logical limiter name) holds the
// fixed-window rate counter and circuit-breaker state so all instances share
// one global limit. See src/controllers/nl-limiter.js for the logic.
module.exports = (sequelize, DataTypes) => {
  const OpenaiRateLimitState = sequelize.define('OpenaiRateLimitState', {
    key: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    // Epoch-millisecond bounds/counters (BIGINT so they fit epoch ms). Stored as
    // numbers, not timestamps, so the atomic UPSERT arithmetic stays trivial.
    window_start: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    window_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cb_failures: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cb_opened_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'openai_rate_limit_state',
    underscored: true,
    timestamps: false,
  });

  return OpenaiRateLimitState;
};
