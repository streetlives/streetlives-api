module.exports = (sequelize, DataTypes) => {
  const Language = sequelize.define('Language', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    language: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Language.associate = (models) => {
    Language.belongsTo(models.Location);
    Language.belongsTo(models.Service);
  };

  return Language;
};
