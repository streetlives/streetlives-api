
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const streetviews = [
      {
        id: Sequelize.literal('uuid_generate_v4()'),
        location_id: '261aeda6-9363-49ac-a90f-0d8322cd9c56',
        streetview_url: 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=40.7453799,-73.9927467&fov=100&heading=43',
        posted_by: 'System',
      },
      {
        id: Sequelize.literal('uuid_generate_v4()'),
        location_id: '43743951-951a-4acf-837d-f79075917e1b',
        streetview_url: 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=40.7505814,-73.9828556&fov=90&heading=120',
        posted_by: 'System',
      },
    ];

    await queryInterface.bulkInsert('streetviews', streetviews);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('streetviews', {
      posted_by: 'System',
    }, {});
  },
};
