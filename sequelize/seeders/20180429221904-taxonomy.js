/* eslint-disable import/no-extraneous-dependencies */
import uuid from 'uuid/v4';

const categoryData = {
  Food: [
    'Soup kitchen',
    'Mobile Soup Kitchen',
    'Brown Bag',
    'Food Pantry',
    'Mobile Pantry',
    'Mobile Market',
    'Farmer\'s Markets',
  ],
  Shelter: [
    'Assessment',
    'Crisis',
    'Single Adult',
    'LGBTQ Young Adult',
    'Safe Haven',
    'Families',
    'Veterans short term housing',
  ],
};

const createTaxonomy = (name, parentObject) => ({
  id: uuid(),
  name,
  parent_id: parentObject ? parentObject.id : null,
  parent_name: parentObject ? parentObject.name : null,
  created_at: new Date(),
  updated_at: new Date(),
});

export default {
  up: (queryInterface, Sequelize) =>
    Promise.all(Object.keys(categoryData).map(async (categoryName) => {
      const categoryObject = createTaxonomy(categoryName);
      await queryInterface.bulkInsert('taxonomies', [categoryObject], {});

      await queryInterface.bulkInsert(
        'taxonomies',
        categoryData[categoryName].map(subcategoryName =>
          createTaxonomy(subcategoryName, categoryObject)),
        {},
      );
    })),

  down: (queryInterface, Sequelize) => queryInterface.bulkDelete('taxonomies', null, {}),
};
