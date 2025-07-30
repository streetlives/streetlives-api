import models from '../../src/models';
import { createInstance, destroyInstance } from '../../src/services/data-changes';

module.exports = {
  async up(queryInterface, Sequelize) {
    const taxonomies = [
      {
        name: 'Employment',
        parent_name: 'Other service',
        parent_id: '1fad2545-15d0-4613-b34c-1407b8b7e74e',
      },
      {
        name: 'Mental Health',
        parent_name: 'Health',
        parent_id: 'e838dbf0-21f8-47c2-b17d-57543e8dbffb',
      },
      {
        name: 'Legal Services',
        parent_name: 'Other service',
        parent_id: '1fad2545-15d0-4613-b34c-1407b8b7e74e',
      },
    ];

    const modelCreateFunction = models.Taxonomy.create.bind(models.Taxonomy);

    for (const taxonomy of taxonomies) {
      await createInstance('<System>', modelCreateFunction, taxonomy, {
        metadata: {
          source: 'migration',
        },
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const taxonomyNames = ['Employment', 'Mental Health', 'Legal Services'];

    const taxonomies = await models.Taxonomy.findAll({
      where: {
        name: taxonomyNames,
      },
    });

    for (const taxonomy of taxonomies) {
      await destroyInstance('<System>', taxonomy, {
        metadata: {
          source: 'migration',
        },
      });
    }
  },
};
