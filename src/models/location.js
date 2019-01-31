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
    additional_info: DataTypes.TEXT,
    hidden_from_search: DataTypes.BOOLEAN,
  }, {
    underscored: true,
    underscoredAll: true,
    hooks: {
      beforeFind: (options) => {
        const isSearchingBySpecificId = options.where.id != null;
        if (!isSearchingBySpecificId) {
          // Mutating args is awful, but is how sequelize hooks officially work:
          // http://docs.sequelizejs.com/manual/tutorial/hooks.html.
          // eslint-disable-next-line no-param-reassign
          options.where.hidden_from_search = { $or: [false, null] };
        }
        return options;
      },
    },
  });

  Location.associate = (models) => {
    Location.belongsTo(models.Organization);
    Location.belongsToMany(models.Service, { through: models.ServiceAtLocation });
    Location.belongsToMany(models.Language, { through: models.LocationLanguages });
    Location.hasMany(models.PhysicalAddress);
    Location.hasMany(models.Phone);
    Location.hasMany(models.RegularSchedule);
    Location.hasMany(models.HolidaySchedule);
    Location.hasMany(models.AccessibilityForDisabilities);
    Location.hasMany(models.Comment);

    // Can't just set defaultScope on the initial model definition:
    // https://github.com/sequelize/sequelize/issues/6245.
    Location.addScope('defaultScope', {
      attributes: { exclude: ['hidden_from_search'] },
    }, { override: true });
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
        sequelize.models.Phone,
        sequelize.models.PhysicalAddress,
        {
          model: sequelize.models.Service,
          include: sequelize.models.Taxonomy,
        },
      ],
    });
  };

  return Location;
};
