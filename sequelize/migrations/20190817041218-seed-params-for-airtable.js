/* eslint-disable object-curly-newline */
// eslint-disable-next-line import/no-extraneous-dependencies
import uuid from 'uuid/v4';

export default {
  up: async (queryInterface, Sequelize) => {
    const taxonomies = await queryInterface.select(null, 'taxonomies');
    const getTaxonomyId = name => taxonomies.find(taxonomy => taxonomy.name === name).id;

    return Promise.all([
      queryInterface.bulkInsert('taxonomy_specific_attributes', [
        {
          id: uuid(),
          name: 'hasHivNutrition',
          taxonomy_id: getTaxonomyId('Food'),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          name: 'wearerAge',
          taxonomy_id: getTaxonomyId('Clothing'),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          name: 'clothingOccasion',
          taxonomy_id: getTaxonomyId('Clothing'),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          name: 'tgncClothing',
          taxonomy_id: getTaxonomyId('Clothing'),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),

      queryInterface.bulkInsert('eligibility_parameters', [
        { id: uuid(), name: 'general', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'gender', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'age', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'income', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'membership', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'languageSpoken', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'orientation', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'communicableDisease', created_at: new Date(), updated_at: new Date() },
        { id: uuid(), name: 'familySize', created_at: new Date(), updated_at: new Date() },
      ]),

      queryInterface.bulkInsert('taxonomies', [
        {
          id: uuid(),
          name: 'Pets',
          parent_name: 'Other service',
          parent_id: getTaxonomyId('Other service'),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          name: 'Health',
          parent_name: null,
          parent_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          name: 'Education',
          parent_name: 'Other service',
          parent_id: getTaxonomyId('Other service'),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),

      queryInterface.bulkInsert('languages', [
        {
          id: uuid(),
          language: 'crp',
          name: 'Creole',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: uuid(),
          language: 'cmn',
          name: 'Mandarin',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    ]);
  },
};
