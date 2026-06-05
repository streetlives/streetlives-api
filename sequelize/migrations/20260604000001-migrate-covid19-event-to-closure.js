module.exports = {
  async up(queryInterface) {
    const sql = 'UPDATE event_related_info SET event = \'CLOSURE\''
      + ' WHERE event = \'COVID19\' AND location_id IS NOT NULL';
    await queryInterface.sequelize.query(sql);
  },

  // eslint-disable-next-line no-unused-vars
  async down(queryInterface) {
    // Safe rollback is not possible: after the up migration runs, CLOSURE rows
    // converted from COVID19 are indistinguishable from CLOSURE rows that were
    // created independently. Re-labelling everything back to COVID19 would
    // corrupt legitimate closure events, so this is intentionally a no-op.
  },
};
