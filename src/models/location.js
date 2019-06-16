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
          options.where.hidden_from_search = { [sequelize.Op.or]: [false, null] };
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

  Location.getUniqueLocationIds = async (params) => {
    const locations = Location.findAll({
      ...params,
      // Should be DISTINCT, not group, but sequelize is weird with distinct alongside associations.
      group: ['Location.id'],
      attributes: ['Location.id'],
      raw: true,
      // Not like associations and grouping work perfectly out of the box either though...
      // https://github.com/sequelize/sequelize/issues/5481
      includeIgnoreAttributes: false,
      // Without this, sequelize limits on a subquery that has only the main table, and applies
      // conditions on it too. Conditions on associated columns will, therefore, fail:
      // https://github.com/sequelize/sequelize/issues/6073
      // As noted there, subQuery: false has problems with the limit count too,
      // but it should be fine as long as we apply it after getting distinct location IDs.
      subQuery: false,
      include: [
        sequelize.models.Organization,
        {
          model: sequelize.models.Service,
          include: sequelize.models.Taxonomy,
        },
      ],
    });

    return locations.map(location => location.id);
  };

  Location.findInArea = async ({
    position,
    radius,
    minResults,
    maxResults,
    filterParameters,
  }) => {
    const { searchString, taxonomyIds } = filterParameters;

    const distance = sequelize.fn(
      'ST_Distance_Sphere',
      sequelize.col('position'),
      sequelize.literal(`ST_GeomFromGeoJSON('${JSON.stringify(position)}')`),
    );

    const filterConditions = [];

    if (searchString) {
      const fuzzySearchString = `%${searchString}%`;
      filterConditions.push(sequelize.or(
        { '$Organization.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Organization.description$': { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Services.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
        { '$Services.Taxonomies.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
      ));
    }

    if (taxonomyIds) {
      filterConditions.push({ '$Services.Taxonomies.id$': { [sequelize.Op.in]: taxonomyIds } });
    }

    const distanceCondition = sequelize.where(distance, { [sequelize.Op.lte]: radius });

    let locationIds = await Location.getUniqueLocationIds({
      where: sequelize.and(...filterConditions, distanceCondition),
      order: [[distance, 'ASC']],
      limit: maxResults,
    });

    // Note: We could avoid having 2 separate queries if we were to first order by distance
    // and assign row numbers per this order, and then filter the rows not just by distance but by:
    // "distance < radius OR row_number <= minResults".
    // However, filtering by window functions requires nested queries, which
    // aren't natively supported by sequelize and would require a raw query.
    // For now, the simplicity and security of sequelize seems worth the slight performance hit.
    if (minResults && locationIds.length < minResults) {
      locationIds = await Location.getUniqueLocationIds({
        where: sequelize.and(...filterConditions),
        order: [[distance, 'ASC']],
        limit: minResults,
      });
    }

    const locationsWithAssociations = await Location.findAll({
      where: { id: { [sequelize.Op.in]: locationIds } },
      include: [
        sequelize.models.Organization,
        {
          model: sequelize.models.Service,
          include: sequelize.models.Taxonomy,
        },
        sequelize.models.Phone,
        sequelize.models.PhysicalAddress,
      ],
      order: [[distance, 'ASC']],
    });
    return locationsWithAssociations;
  };

  return Location;
};
