module.exports = (sequelize, DataTypes) => {
  const ServiceAtLocation = sequelize.define('ServiceAtLocation', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    description: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  ServiceAtLocation.associate = (models) => {
    ServiceAtLocation.hasMany(models.Comment);
  };

  return ServiceAtLocation;
};
