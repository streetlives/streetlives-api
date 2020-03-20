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
  'Personal Care': [
    'Shower',
  ],
  Clothing: [
    'Clothing Pantry',
    'Laundry',
  ],
  'Other service': [
    'Benefits',
    'Advocates / Legal Aid',
    'Case Workers',
    'Mail',
    'Free Wifi',
    'Taxes',
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
  up: async (queryInterface, Sequelize) => {
    const existingCategories = await queryInterface.sequelize.query('SELECT name FROM taxonomies');

    const existingCategoryNames = existingCategories[0].map(({ name }) => name);
    const remainingCategoryNames = Object.keys(categoryData).filter(categoryName =>
      !existingCategoryNames.includes(categoryName));

    return Promise.all(remainingCategoryNames.map(async (categoryName) => {
      const categoryObject = createTaxonomy(categoryName);
      await queryInterface.bulkInsert('taxonomies', [categoryObject], {});

      await queryInterface.bulkInsert(
        'taxonomies',
        categoryData[categoryName].map(subcategoryName =>
          createTaxonomy(subcategoryName, categoryObject)),
        {},
      );
    }));
  },

  down: (queryInterface, Sequelize) => queryInterface.bulkDelete('taxonomies', null, {}),
};
