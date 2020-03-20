module.exports = (sequelize, DataTypes) => {
  const ServiceArea = sequelize.define('ServiceArea', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    postal_codes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
    },
    description: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  ServiceArea.associate = (models) => {
    ServiceArea.belongsTo(models.Service);
  };

  return ServiceArea;
};
