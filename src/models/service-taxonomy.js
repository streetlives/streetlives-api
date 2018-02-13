module.exports = (sequelize, DataTypes) => {
  const ServiceTaxonomy = sequelize.define('ServiceTaxonomy', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
  }, {
    tableName: 'service_taxonomy',
    underscored: true,
    underscoredAll: true,
  });

  return ServiceTaxonomy;
};
