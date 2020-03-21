module.exports = (sequelize, DataTypes) => {
  const EventRelatedInfo = sequelize.define('EventRelatedInfo', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    event: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    information: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  }, {
    tableName: 'event_related_info',
    underscored: true,
    underscoredAll: true,
    indexes: [
      {
        unique: true,
        fields: ['event', 'service_id', 'location_id'],
      },
    ],
  });

  EventRelatedInfo.associate = (models) => {
    EventRelatedInfo.belongsTo(models.Location);
    EventRelatedInfo.belongsTo(models.Service);
  };

  return EventRelatedInfo;
};
