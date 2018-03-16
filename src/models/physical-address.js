module.exports = (sequelize, DataTypes) => {
  const PhysicalAddress = sequelize.define('PhysicalAddress', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    address_1: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    city: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    region: DataTypes.TEXT,
    state_province: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    postal_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    country: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
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
