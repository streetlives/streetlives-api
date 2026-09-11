module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.createTable('comment_likes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      comment_id: {
        type: Sequelize.DataTypes.UUID,
        references: {
          model: {
            tableName: 'comments',
            // schema: 'schema',
          },
          key: 'id',
          onDelete: 'CASCADE',
        },
        allowNull: false,
      },
      ip_address: {
        type: Sequelize.STRING(45), // Supports IPv4 and IPv6
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('comment_likes');
  },
};
