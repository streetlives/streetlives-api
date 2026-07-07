const migration = require('../../sequelize/migrations/20250209132813-create_comment_likes_table');

describe('comment-likes migration', () => {
  it('creates comment_likes.id as an integer to match production', async () => {
    const queryInterface = {
      createTable: jest.fn(() => Promise.resolve()),
    };
    const Sequelize = {
      INTEGER: 'INTEGER',
      DataTypes: {
        UUID: 'UUID',
      },
      STRING: jest.fn(length => `STRING(${length})`),
    };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'comment_likes',
      expect.objectContaining({
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
      }),
    );
  });
});
