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

    const metadata = taxonomies.flatMap((record => ([
      {
        id: uuid(),
        resource_id: record.id,
        resource_table: 'taxonomies',
        last_action_date: new Date(),
        last_action_type: 'create',
        field_name: 'name',
        replacement_value: record.name,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuid(),
        resource_id: record.id,
        resource_table: 'taxonomies',
        last_action_date: new Date(),
        last_action_type: 'create',
        field_name: 'parent_name',
        replacement_value: record.parent_name,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]
    )));

    await queryInterface.bulkInsert('taxonomies', taxonomies);
    queryInterface.bulkInsert('metadata', metadata);
  },

  async down(queryInterface, Sequelize) {
    const taxonomyNames = ['Employment', 'Mental Health', 'Legal Services'];

    await queryInterface.bulkDelete('taxonomies', {
      name: { [Sequelize.Op.in]: taxonomyNames },
    });
    await queryInterface.bulkDelete('metadata', {
      resource_table: 'taxonomies',
      replacement_value: { [Sequelize.Op.in]: taxonomyNames },
    });
  },
};
