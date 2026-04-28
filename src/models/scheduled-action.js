module.exports = (sequelize, DataTypes) => {
  const statuses = {
    scheduled: 'scheduled',
    running: 'running',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
  };

  const methods = {
    patch: 'PATCH',
    delete: 'DELETE',
  };

  const ScheduledAction = sequelize.define('ScheduledAction', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    method: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resource: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resource_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    payload: DataTypes.JSONB,
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: statuses.scheduled,
    },
    run_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    requested_by: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    label: DataTypes.TEXT,
    note: DataTypes.TEXT,
    changed_fields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    metadata: DataTypes.JSONB,
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    last_error: DataTypes.TEXT,
    last_error_at: DataTypes.DATE,
    locked_at: DataTypes.DATE,
    locked_by: DataTypes.TEXT,
    completed_at: DataTypes.DATE,
    cancelled_at: DataTypes.DATE,
    result: DataTypes.JSONB,
  }, {
    tableName: 'scheduled_actions',
    underscored: true,
    underscoredAll: true,
  });

  ScheduledAction.statuses = statuses;
  ScheduledAction.methods = methods;

  return ScheduledAction;
};
