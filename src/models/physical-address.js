module.exports = (sequelize, DataTypes) => {
  const PhysicalAddress = sequelize.define('PhysicalAddress', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    address_1: DataTypes.TEXT,
    city: DataTypes.TEXT,
    region: DataTypes.TEXT,
    state_province: DataTypes.TEXT,
    postal_code: DataTypes.TEXT,
    country: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  PhysicalAddress.associate = (models) => {
    PhysicalAddress.belongsTo(models.Location);
    PhysicalAddress.belongsTo(models.LocationSuggestion);
  };

  return PhysicalAddress;
};
