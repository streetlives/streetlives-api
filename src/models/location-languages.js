module.exports = (sequelize, DataTypes) => {
  const LocationLanguages = sequelize.define('LocationLanguages', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  return LocationLanguages;
};
