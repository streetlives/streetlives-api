module.exports = (sequelize, DataTypes) => {
  const RegularSchedule = sequelize.define('RegularSchedule', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    weekday: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    opens_at: DataTypes.TIME,
    closes_at: DataTypes.TIME,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  RegularSchedule.associate = (models) => {
    RegularSchedule.belongsTo(models.Location, { foreignKey: 'location_id' });
    RegularSchedule.belongsTo(models.Service, { foreignKey: 'service_id' });
    RegularSchedule.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
  };

  return RegularSchedule;
};
