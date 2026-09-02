
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('streetviews', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'locations',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      pano_id: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      lat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },
      lng: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },
      heading: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      pitch: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      fov: {
        type: Sequelize.SMALLINT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('streetviews');
  },
};
