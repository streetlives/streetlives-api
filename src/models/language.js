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
    Language.belongsToMany(models.Location, {
      through: models.LocationLanguages,
      foreignKey: 'language_id',
      otherKey: 'location_id',
    });
    Language.belongsToMany(models.Service, {
      through: models.ServiceLanguages,
      foreignKey: 'language_id',
      otherKey: 'service_id',
    });
  };

  return Language;
};
