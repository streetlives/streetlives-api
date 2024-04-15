module.exports = (sequelize, DataTypes) => {
  const HolidaySchedule = sequelize.define('HolidaySchedule', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    closed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    opens_at: DataTypes.TIME,
    closes_at: DataTypes.TIME,
    start_date: DataTypes.DATEONLY,
    end_date: DataTypes.DATEONLY,
    weekday: DataTypes.INTEGER,
    occasion: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  HolidaySchedule.associate = (models) => {
    HolidaySchedule.belongsTo(models.Location, { foreignKey: 'location_id' });
    HolidaySchedule.belongsTo(models.Service, { foreignKey: 'service_id' });
    HolidaySchedule.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
  };

  return HolidaySchedule;
};
