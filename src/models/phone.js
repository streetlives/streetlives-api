module.exports = (sequelize, DataTypes) => {
  const Phone = sequelize.define('Phone', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    number: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    extension: DataTypes.INTEGER,
    type: DataTypes.TEXT,
    language: DataTypes.TEXT,
    description: DataTypes.TEXT,
    script_updated_at: DataTypes.DATE,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Phone.associate = (models) => {
    Phone.belongsTo(models.Location, { foreignKey: 'location_id' });
    Phone.belongsTo(models.Service, { foreignKey: 'service_id' });
    Phone.belongsTo(models.Organization, { foreignKey: 'organization_id' });
    Phone.belongsTo(models.ServiceAtLocation, { foreignKey: 'service_at_location_id' });
  };

  return Phone;
};
