module.exports = (sequelize, DataTypes) => {
  const EligibilityParameter = sequelize.define('EligibilityParameter', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  EligibilityParameter.associate = (models) => {
    EligibilityParameter.hasMany(models.Eligibility, {
      foreignKey: { name: 'parameter_id' },
    });
  };

  return EligibilityParameter;
};
