// Shared store for the cross-instance rate limit and circuit breaker guarding
// the paid OpenAI natural-language-search call (see src/controllers/nl-limiter.js).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('openai_rate_limit_state', {
      key: {
        type: Sequelize.TEXT,
        primaryKey: true,
        allowNull: false,
      },
      window_start: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      window_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      cb_failures: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      cb_opened_at: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('openai_rate_limit_state');
  },
};
