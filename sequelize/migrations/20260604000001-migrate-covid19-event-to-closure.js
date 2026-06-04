module.exports = {
  async up(queryInterface) {
    const sql = 'UPDATE event_related_info SET event = \'CLOSURE\''
      + ' WHERE event = \'COVID19\' AND location_id IS NOT NULL';
    await queryInterface.sequelize.query(sql);
  },

  async down(queryInterface) {
    const sql = 'UPDATE event_related_info SET event = \'COVID19\''
      + ' WHERE event = \'CLOSURE\' AND location_id IS NOT NULL';
    await queryInterface.sequelize.query(sql);
  },
};
