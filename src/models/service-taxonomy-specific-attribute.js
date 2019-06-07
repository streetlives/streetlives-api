module.exports = (sequelize, DataTypes) => {
  const ServiceTaxonomySpecificAttribute = sequelize.define('ServiceTaxonomySpecificAttribute', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    values: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  }, {
    underscored: true,
    underscoredAll: true,
  });

  ServiceTaxonomySpecificAttribute.associate = (models) => {
    ServiceTaxonomySpecificAttribute.belongsTo(models.TaxonomySpecificAttribute, {
      foreignKey: {
        name: 'attribute_id',
        unique: 'single_value_per_attr_on_service',
      },
    });
    ServiceTaxonomySpecificAttribute.belongsTo(models.Service, {
      foreignKey: {
        name: 'service_id',
        unique: 'single_value_per_attr_on_service',
      },
    });
  };

  return ServiceTaxonomySpecificAttribute;
};
