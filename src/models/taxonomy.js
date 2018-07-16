module.exports = (sequelize, DataTypes) => {
  const Taxonomy = sequelize.define('Taxonomy', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    parent_name: DataTypes.TEXT,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Taxonomy.associate = (models) => {
    Taxonomy.belongsTo(models.Taxonomy, { as: 'Parent', foreignKey: 'parent_id' });
    Taxonomy.hasMany(models.Taxonomy, { as: 'Children', foreignKey: 'parent_id' });
    Taxonomy.belongsToMany(models.Service, { through: models.ServiceTaxonomy });
  };

  Taxonomy.getHierarchy = async () => {
    const taxonomyObjects = await Taxonomy.findAll();

    const taxonomyIdsToObjects = taxonomyObjects.reduce((currObjects, taxonomyObject) => ({
      ...currObjects,
      [taxonomyObject.id]: taxonomyObject.get({ plain: true }),
    }), {});

    const taxonomyRoot = {};

    Object.keys(taxonomyIdsToObjects).forEach((taxonomyId) => {
      const taxonomyObject = taxonomyIdsToObjects[taxonomyId];
      const parentId = taxonomyObject.parent_id;

      const parent = parentId ? taxonomyIdsToObjects[parentId] : taxonomyRoot;
      const { children = [] } = parent;
      parent.children = [...children, taxonomyObject];
    });

    return taxonomyRoot.children;
  };

  return Taxonomy;
};
