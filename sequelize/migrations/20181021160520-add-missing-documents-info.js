// eslint-disable-next-line import/no-extraneous-dependencies
import uuid from 'uuid/v4';

export default {
  up: async (queryInterface, Sequelize) => {
    const query = `SELECT id
      FROM services
      WHERE id NOT IN (
        SELECT DISTINCT service_id
        FROM documents_infos
        WHERE service_id IS NOT NULL
      );`;
    const servicesWithMissingDocs = await queryInterface.sequelize.query(
      query,
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (!servicesWithMissingDocs.length) {
      return Promise.resolve();
    }

    const documentsInfoObjects = servicesWithMissingDocs.map(({ id }) => ({
      id: uuid(),
      service_id: id,
      created_at: new Date(),
      updated_at: new Date(),
    }));
    return queryInterface.bulkInsert('documents_infos', documentsInfoObjects);
  },
};
