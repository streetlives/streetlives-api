module.exports = (sequelize, DataTypes) => {
  const EditHistory = sequelize.define('EditHistory', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    location_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    service_id: DataTypes.UUID,
    organization_id: DataTypes.UUID,
    phone_id: DataTypes.UUID,
    page_path: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    user_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    action: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    field: DataTypes.TEXT,
    label: DataTypes.TEXT,
    before_value: DataTypes.TEXT,
    after_value: DataTypes.TEXT,
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resource_table: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resource_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    source: DataTypes.TEXT,
    action_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    copyedit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'edit_history',
    underscored: true,
    underscoredAll: true,
    indexes: [
      { fields: ['location_id', 'action_at'] },
      { fields: ['user_name', 'action_at'] },
      { fields: ['page_path'] },
    ],
  });

  return EditHistory;
};
