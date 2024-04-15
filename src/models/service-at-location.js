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
    ServiceAtLocation.hasMany(models.Phone, { foreignKey: 'service_at_location_id' });
    ServiceAtLocation.hasMany(models.RegularSchedule, { foreignKey: 'service_at_location_id' });
    ServiceAtLocation.hasMany(models.HolidaySchedule, { foreignKey: 'service_at_location_id' });
    ServiceAtLocation.hasMany(models.Comment, { foreignKey: 'service_at_location_id' });
  };

  return ServiceAtLocation;
};
