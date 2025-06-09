import uuid from 'uuid/v4';

module.exports = {
  async up(queryInterface, Sequelize) {
    const taxonomies = [
      {
        id: uuid(), name: 'Employment', parent_name: 'Other service', created_at: new Date(), updated_at: new Date(), parent_id: '1fad2545-15d0-4613-b34c-1407b8b7e74e',
      },
      {
        id: uuid(), name: 'Mental Health', parent_name: 'Health', created_at: new Date(), updated_at: new Date(), parent_id: 'e838dbf0-21f8-47c2-b17d-57543e8dbffb',
      },
      {
        id: uuid(), name: 'Legal Services', parent_name: 'Other service', created_at: new Date(), updated_at: new Date(), parent_id: '1fad2545-15d0-4613-b34c-1407b8b7e74e',
      },
    ];

    await queryInterface.bulkInsert('taxonomies', taxonomies);
  },

  async down(queryInterface, Sequelize) {
    const taxonomyNames = ['Employment', 'Mental Health', 'Legal Services'];

    await queryInterface.bulkDelete('taxonomies', {
      name: { [Sequelize.Op.in]: taxonomyNames },
    });
  },
};
