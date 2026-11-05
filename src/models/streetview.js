
module.exports = (sequelize, DataTypes) => {
  const Streetview = sequelize.define('Streetview', {
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
    pano_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    lat: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
    },
    lng: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
    },
    heading: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: {
        min: 0,
        max: 360,
      },
    },
    pitch: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: {
        min: -90,
        max: 90,
      },
    },
    fov: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: {
        min: 10,
        max: 120,
      },
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Streetview.associate = (models) => {
    Streetview.belongsTo(models.Location, { foreignKey: 'location_id' });
  };

  return Streetview;
};
