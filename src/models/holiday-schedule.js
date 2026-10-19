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
    // HSDS 3.0 schedule fields.
    freq: {
      type: DataTypes.TEXT,
      validate: { isIn: [['WEEKLY', 'MONTHLY']] },
    },
    interval: DataTypes.INTEGER,
    byday: DataTypes.TEXT,
    bymonthday: DataTypes.TEXT,
    valid_from: DataTypes.DATEONLY,
    valid_to: DataTypes.DATEONLY,
    description: DataTypes.TEXT,
    notes: DataTypes.TEXT,
    timezone: {
      type: DataTypes.TEXT,
      defaultValue: 'America/New_York',
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  HolidaySchedule.associate = (models) => {
    HolidaySchedule.belongsTo(models.Location, { foreignKey: 'location_id' });
    HolidaySchedule.belongsTo(models.Service, { foreignKey: 'service_id' });
    HolidaySchedule.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
  };

  // Include options that leave out rows whose HSDS valid_to date has passed in New York.
  HolidaySchedule.notExpiredInclude = () => ({
    model: HolidaySchedule,
    required: false,
    where: {
      [sequelize.Sequelize.Op.or]: [
        { valid_to: null },
        {
          valid_to: {
            [sequelize.Sequelize.Op.gte]:
              sequelize.literal("(now() AT TIME ZONE 'America/New_York')::date"),
          },
        },
      ],
    },
  });

  return HolidaySchedule;
};
