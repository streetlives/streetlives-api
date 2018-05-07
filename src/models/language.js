module.exports = (sequelize, DataTypes) => {
  const Language = sequelize.define('Language', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    language: DataTypes.TEXT,
    name: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Language.associate = (models) => {
    Language.belongsToMany(models.Location, { through: models.LocationLanguages });
    Language.belongsToMany(models.Service, { through: models.ServiceLanguages });
  };

  return Language;
};
