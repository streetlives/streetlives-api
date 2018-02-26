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
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  HolidaySchedule.associate = (models) => {
    HolidaySchedule.belongsTo(models.Location);
    HolidaySchedule.belongsTo(models.Service);
    HolidaySchedule.belongsTo(models.ServiceAtLocation);
  };

  return HolidaySchedule;
};
