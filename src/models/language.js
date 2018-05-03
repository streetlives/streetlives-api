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
    Language.belongsToMany(models.Location, { through: 'location_languages' });
    Language.belongsToMany(models.Service, { through: 'service_languages' });
  };

  return Language;
};
