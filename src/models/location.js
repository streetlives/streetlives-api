module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: DataTypes.TEXT,
    description: DataTypes.TEXT,
    transportation: DataTypes.TEXT,
    position: DataTypes.GEOMETRY,
  }, {
    underscored: true,
    underscoredAll: true,
  });

  Location.associate = (models) => {
    Location.belongsTo(models.Organization);
    Location.belongsToMany(models.Service, { through: models.ServiceAtLocation });
    Location.hasMany(models.PhysicalAddress);
    Location.hasMany(models.Phone);
    Location.hasMany(models.Comment);
  };

  Location.findAllInArea = (position, radius, filterParameters) => {
    const { searchString, taxonomyId } = filterParameters;

    const distance = sequelize.fn(
      'ST_Distance_Sphere',
      sequelize.literal('position'),
      sequelize.literal(`ST_GeomFromGeoJSON('${JSON.stringify(position)}')`),
    );

    const conditions = [];
    conditions.push(sequelize.where(distance, { $lte: radius }));

    if (searchString) {
      const fuzzySearchString = `%${searchString}%`;
      conditions.push(sequelize.or(
        { name: { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Organization.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Services.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Services.Taxonomies.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
      ));
    }

    if (taxonomyId) {
      conditions.push({ '$Services.Taxonomies.id$': taxonomyId });
    }

    return Location.findAll({
      where: sequelize.and(...conditions),
      include: [
        sequelize.models.Organization,
        {
          model: sequelize.models.Service,
          include: sequelize.models.Taxonomy,
        },
      ],
    });
  };

  return Location;
};
