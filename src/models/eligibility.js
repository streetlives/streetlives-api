module.exports = (sequelize, DataTypes) => {
  const Eligibility = sequelize.define('Eligibility', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    eligible_values: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    description: DataTypes.TEXT,
  }, {
    tableName: 'eligibility',
    underscored: true,
    underscoredAll: true,
  });

  Eligibility.associate = (models) => {
    Eligibility.belongsTo(models.EligibilityParameter, {
      foreignKey: {
        name: 'parameter_id',
        unique: 'single_value_per_param_on_service',
      },
    });
    Eligibility.belongsTo(models.Service, {
      foreignKey: {
        name: 'service_id',
        unique: 'single_value_per_param_on_service',
      },
    });
  };

  return Eligibility;
};
