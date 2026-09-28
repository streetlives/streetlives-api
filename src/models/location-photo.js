// An organization-provided photo that replaces the Google Street View still on
// yourpeer.nyc. See sequelize/migrations/20260930120000-create-location-photos-table.js
// for why this is its own table rather than a column on `streetviews`.
module.exports = (sequelize, DataTypes) => {
  const LocationPhoto = sequelize.define('LocationPhoto', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    location_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    // The bucket is recorded next to the key, not instead of configuration, so
    // a row restored into another environment is self-describing: you can tell
    // the object does not live in this environment's bucket.
    s3_bucket: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    s3_key: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content_type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    byte_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },
    original_filename: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sha256: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Composed at read time from the key plus the environment's CDN domain.
    // Storing the URL instead would break the moment a prod snapshot is
    // restored into Stage - every row would point at the prod CDN - and would
    // turn a domain change into a data backfill.
    //
    // Because handleGetInfoResponse spreads location.get({ plain: true }), a
    // virtual attribute serializes everywhere this model is included, with no
    // controller changes and no duplicated URL composition.
    url: {
      type: new DataTypes.VIRTUAL(DataTypes.STRING, ['s3_key']),
      get() {
        /* eslint-disable global-require */
        const { buildPublicUrl } = require('../services/photo-storage');
        /* eslint-enable global-require */
        return buildPublicUrl(this.get('s3_key'));
      },
    },
  }, {
    underscored: true,
  });

  LocationPhoto.associate = (models) => {
    LocationPhoto.belongsTo(models.Location, { foreignKey: 'location_id' });
  };

  return LocationPhoto;
};
