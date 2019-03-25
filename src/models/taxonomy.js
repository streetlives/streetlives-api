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

  Taxonomy.getTaxonomiesWithDescendants = async () => {
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

    return {
      ...taxonomyIdsToObjects,
      root: taxonomyRoot,
    };
  };

  Taxonomy.getHierarchy = async () => {
    const taxonomyObjects = await Taxonomy.getTaxonomiesWithDescendants();
    return taxonomyObjects.root.children;
  };

  Taxonomy.getAllIdsWithinTaxonomies = async (taxonomyIds) => {
    const taxonomyIdsToObjects = await Taxonomy.getTaxonomiesWithDescendants();

    const requestedTaxonomies = taxonomyIds.map(id => taxonomyIdsToObjects[id]);

    const flattenIds = (taxonomies) => {
      if (!taxonomies) {
        return {};
      }

      return taxonomies.reduce(
        (flatIds, taxonomy) => {
          if (!taxonomy || !taxonomyIdsToObjects[taxonomy.id]) {
            return flatIds;
          }

          return {
            ...flatIds,
            [taxonomy.id]: true,
            ...flattenIds(taxonomyIdsToObjects[taxonomy.id].children),
          };
        },
        {},
      );
    };

    return Object.keys(flattenIds(requestedTaxonomies));
  };

  return Taxonomy;
};
