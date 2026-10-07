module.exports = (sequelize, DataTypes) => {
  // Intentionally do not map `neighborhood` here. Migration
  // 20240530015650-update-everything-to-use-geoqueries removes
  // physical_addresses.neighborhood and replaces it with geocoded metadata.
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
    script_updated_at: DataTypes.DATE,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  PhysicalAddress.associate = (models) => {
    PhysicalAddress.belongsTo(models.Location, { foreignKey: 'location_id' });
    PhysicalAddress.belongsTo(models.LocationSuggestion, { foreignKey: 'location_suggestion_id' });
  };

  return PhysicalAddress;
};
