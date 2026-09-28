// An organization-provided photo that replaces the Google Street View still on
// yourpeer.nyc. The bytes live in S3; this table holds the object's identity.
//
// The photo deliberately does NOT live on `streetviews`: streetlives-web
// collapses an all-null streetview payload to null to delete the override row,
// so a column here would mean clearing a Street View override silently
// destroys the uploaded photo.
//
// Note that `down` drops the table but does not delete the S3 objects. A
// rollback therefore orphans them and the photos disappear from the site.
// Deleting from S3 here would need credentials the CLI may not have, and is
// irreversible, so the orphan is the better trade.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('location_photos', {
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
      s3_bucket: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      s3_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      content_type: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      byte_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      width: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      height: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      original_filename: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sha256: {
        type: Sequelize.TEXT,
        allowNull: false,
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
    await queryInterface.dropTable('location_photos');
  },
};
