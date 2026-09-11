// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const emptyState = () => ({
  sessions: {},
  calls: {},
  quotas: {},
  events: {},
});

function createStore(sequelize) {
  return {
    // The bounded pilot uses one transaction-scoped DB lock for all admissions.
    // This intentionally serializes queue/capacity/budget checks across Lambda instances.
    // Provider network operations NEVER run while holding this transaction.
    transaction: work =>
      sequelize.transaction(async (transaction) => {
        await sequelize.query('SELECT pg_advisory_xact_lock(19293844, 1117)', { transaction });
        const [rows] = await sequelize.query(
          'SELECT state FROM public_calling_state WHERE key = :key',
          {
            replacements: { key: 'v1' },
            transaction,
            logging: false,
          },
        );
        const state = rows.length ? rows[0].state : emptyState();
        const result = await work(state);
        await sequelize.query(
          `INSERT INTO public_calling_state (key, state) VALUES (:key, CAST(:state AS jsonb))
        ON CONFLICT (key) DO UPDATE SET state = EXCLUDED.state`,
          {
            replacements: { key: 'v1', state: JSON.stringify(state) },
            transaction,
            logging: false,
          },
        );
        return result;
      }),
  };
}

module.exports = { createStore, emptyState };
