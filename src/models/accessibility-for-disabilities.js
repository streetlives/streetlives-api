module.exports = (sequelize, DataTypes) => {
  const AccessibilityForDisabilities = sequelize.define('AccessibilityForDisabilities', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    accessibility: DataTypes.TEXT,
    details: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  AccessibilityForDisabilities.associate = (models) => {
    AccessibilityForDisabilities.belongsTo(models.Location);
  };

  return AccessibilityForDisabilities;
};
