// The original an organization photo was cropped from, kept so the crop can be
// adjusted after saving. Without it the stored image is all that is left, and
// whatever the first crop cut off is gone for good.
//
// The original is a separate object in the same bucket, under the same
// digest-keyed layout as the photo itself. `crop` is the cropper's own framing
// ({ x, y, zoom }), which is what reopening it needs; it is meaningless to
// anything else, so like the source columns it stays out of the public payload.
//
// All nullable: rows saved before this have no original, and the currently
// deployed code keeps writing rows without one until it is replaced.
//
// As with the table itself, `down` drops the columns but leaves the S3 objects.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('location_photos', 'source_s3_key', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('location_photos', 'source_content_type', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('location_photos', 'source_width', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('location_photos', 'source_height', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('location_photos', 'crop', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('location_photos', 'crop');
    await queryInterface.removeColumn('location_photos', 'source_height');
    await queryInterface.removeColumn('location_photos', 'source_width');
    await queryInterface.removeColumn('location_photos', 'source_content_type');
    await queryInterface.removeColumn('location_photos', 'source_s3_key');
  },
};
