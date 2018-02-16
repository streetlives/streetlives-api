module.exports = (sequelize, DataTypes) => {
  const PhysicalAddress = sequelize.define('PhysicalAddress', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    address_1: DataTypes.STRING,
    city: DataTypes.STRING,
    region: DataTypes.STRING,
    state_province: DataTypes.STRING,
    postal_code: DataTypes.STRING,
    country: DataTypes.STRING,
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
