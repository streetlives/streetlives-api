// Indexed by (ISO weekday + 6) % 7, so 1 is Monday and both 7 and a legacy 0 are Sunday.
const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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
      validate: { isIn: [['WEEKLY', 'MONTHLY', 'YEARLY']] },
    },
    interval: DataTypes.INTEGER,
    byday: DataTypes.TEXT,
    bymonthday: DataTypes.TEXT,
    valid_from: DataTypes.DATEONLY,
    valid_to: DataTypes.DATEONLY,
    description: DataTypes.TEXT,
    // Dates a series skips, like deleting one occurrence in Google Calendar. Not in HSDS.
    exdates: DataTypes.ARRAY(DataTypes.DATEONLY),
    // RFC 5545 BYMONTH, e.g. "12" or "6,7,8": the months a rule applies in. Not in HSDS.
    bymonth: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
    hooks: {
      /* eslint-disable no-param-reassign */
      beforeValidate(schedule) {
        if (!schedule.freq && !schedule.closed && schedule.weekday != null) {
          // An open row with a weekday and no freq repeats every week on that weekday, as rows
          // did before HSDS recurrence. Saying so in freq lets readers go by freq alone.
          schedule.freq = 'WEEKLY';
          schedule.byday = schedule.byday || BYDAY_CODES[(schedule.weekday + 6) % 7];
        } else if (!schedule.freq && schedule.valid_from && !schedule.valid_to) {
          // A one-off without an end date is that one day.
          schedule.valid_to = schedule.valid_from;
        }
      },
      /* eslint-enable no-param-reassign */
    },
    validate: {
      // RFC 5545: a numbered BYDAY ("2FR") and BYMONTHDAY only apply within a month or year.
      monthlyOnlyRecurrence() {
        if (!['MONTHLY', 'YEARLY'].includes(this.freq) &&
          ((this.byday && /\d/.test(this.byday)) || this.bymonthday)) {
          throw new Error('A numbered byday or a bymonthday needs freq MONTHLY or YEARLY');
        }
      },
      // A yearly row names its months and the days in them, so "4TH" is the 4th Thursday of
      // the month rather than of the year.
      yearlyNamesMonthAndDays() {
        if (this.freq === 'YEARLY' && (!this.bymonth || (!this.byday && !this.bymonthday))) {
          throw new Error('A yearly row needs a bymonth and a byday or bymonthday');
        }
      },
      // valid_from is the first occurrence, and "every 2 weeks" counts from it.
      intervalNeedsStart() {
        if (this.interval > 1 && !this.valid_from) {
          throw new Error('An interval above 1 needs a valid_from to count from');
        }
      },
      exdatesOnlyOnSeries() {
        if (this.exdates && this.exdates.length && !this.freq) {
          throw new Error('Only a repeating row (with freq) can skip dates');
        }
      },
    },
  });

  HolidaySchedule.associate = (models) => {
    HolidaySchedule.belongsTo(models.Location, { foreignKey: 'location_id' });
    HolidaySchedule.belongsTo(models.Service, { foreignKey: 'service_id' });
    HolidaySchedule.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
  };

  // Include options that leave out rows whose HSDS valid_to date has passed in New York,
  // or has passed by `onDate` (YYYY-MM-DD) when one is given.
  HolidaySchedule.notExpiredInclude = onDate => ({
    model: HolidaySchedule,
    required: false,
    where: {
      [sequelize.Sequelize.Op.or]: [
        { valid_to: null },
        {
          valid_to: {
            [sequelize.Sequelize.Op.gte]: onDate ||
              sequelize.literal("(now() AT TIME ZONE 'America/New_York')::date"),
          },
        },
      ],
    },
  });

  return HolidaySchedule;
};
