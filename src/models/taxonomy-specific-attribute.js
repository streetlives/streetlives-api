module.exports = (sequelize, DataTypes) => {
  const TaxonomySpecificAttribute = sequelize.define('TaxonomySpecificAttribute', {
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

  TaxonomySpecificAttribute.associate = (models) => {
    TaxonomySpecificAttribute.belongsTo(models.Taxonomy);
    TaxonomySpecificAttribute.hasMany(models.ServiceTaxonomySpecificAttribute, {
      foreignKey: { name: 'attribute_id' },
    });
  };

  return TaxonomySpecificAttribute;
};
