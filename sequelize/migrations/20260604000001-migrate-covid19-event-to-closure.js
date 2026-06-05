module.exports = {
  async up(queryInterface) {
    const sql = 'UPDATE event_related_info SET event = \'CLOSURE\''
      + ' WHERE event = \'COVID19\' AND location_id IS NOT NULL';
    await queryInterface.sequelize.query(sql);
  },

  // Down is intentionally a no-op: CLOSURE is a new type introduced alongside
  // this migration, so rolling back the code already makes CLOSURE rows inert
  // (the reverted code checks for COVID19, not CLOSURE). Converting them back
  // risks corrupting rows created legitimately after this migration ran.
  // eslint-disable-next-line no-empty-function
  async down() {},
};
