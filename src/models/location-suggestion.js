module.exports = (sequelize, DataTypes) => {
  const LocationSuggestion = sequelize.define('LocationSuggestion', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.STRING,
    position: DataTypes.GEOMETRY,
    taxonomy_ids: DataTypes.STRING,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  LocationSuggestion.associate = (models) => {
    LocationSuggestion.hasMany(models.PhysicalAddress);
  };

  return LocationSuggestion;
};
