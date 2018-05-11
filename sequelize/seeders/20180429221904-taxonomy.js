/* eslint-disable import/no-extraneous-dependencies */
const uuid = require('uuid/v4');

const categoryData = {
  Shelter: [
    "Intake",
    "Crisis",
    "Single Adult",
    "LGBTQ Young Adult",
    "Safe Haven",
    "Families"
  ],
  Food:[
    "Soup kitchen",
    "Mobile Soup Kitchen",
    "Brown Bag",
    "Food Pantry",
    "Mobile Pantry",
    "Mobile Market",
    "Farmer's Markets"
  ],
  "Other service":[
    "Benefits",
    "Advocates / Legal Aid",
    "Case Workers",
    "Mail",
    "Free Wifi",
    "Taxes"
  ]
};

const createTaxonomy = (name, parentObject) => ({
  id: uuid(),
  name,
  parent_id: parentObject ? parentObject.id : null,
  parent_name: parentObject ? parentObject.name : null,
  created_at: new Date(),
  updated_at: new Date(),
});

module.exports = {
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
