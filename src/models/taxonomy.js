module.exports = (sequelize, DataTypes) => {
  const Taxonomy = sequelize.define('Taxonomy', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parent_name: DataTypes.STRING,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Taxonomy.associate = (models) => {
    Taxonomy.belongsTo(models.Taxonomy, { as: 'Parent', foreignKey: 'parent_id' });
    Taxonomy.hasMany(models.Taxonomy, { as: 'Children', foreignKey: 'parent_id' });
    Taxonomy.belongsToMany(models.Service, { through: models.ServiceTaxonomy });
  };

  return Taxonomy;
};
