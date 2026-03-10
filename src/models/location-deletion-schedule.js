module.exports = (sequelize, DataTypes) => {
  const LocationDeletionSchedule = sequelize.define('LocationDeletionSchedule', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    requested_by: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    scheduled_for_permanent_deletion_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    deleted_service_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    was_hidden_from_search: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  LocationDeletionSchedule.associate = (models) => {
    LocationDeletionSchedule.belongsTo(models.Location, {
      foreignKey: {
        name: 'location_id',
        allowNull: false,
      },
      onDelete: 'CASCADE',
    });
  };

  return LocationDeletionSchedule;
};
