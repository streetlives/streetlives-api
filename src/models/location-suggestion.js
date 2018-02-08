module.exports = (sequelize, DataTypes) => {
  const LocationSuggestion = sequelize.define('LocationSuggestion', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.STRING,
    latitude: DataTypes.FLOAT,
    longitude: DataTypes.FLOAT,
    taxonomy_ids: DataTypes.STRING,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  return LocationSuggestion;
};
