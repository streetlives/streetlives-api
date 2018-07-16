module.exports = (sequelize, DataTypes) => {
  const ServiceLanguages = sequelize.define('ServiceLanguages', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  return ServiceLanguages;
};
