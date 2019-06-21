import { getDayOfWeekIntegerFromDate, formatTime } from '../utils/times';

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

  const getSearchStringCondition = (searchString) => {
    const fuzzySearchString = `%${searchString}%`;
    return sequelize.or(
      { '$Organization.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
      { '$Organization.description$': { [sequelize.Op.iLike]: fuzzySearchString } },
      { '$Services.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
      { '$Services.Taxonomies.name$': { [sequelize.Op.iLike]: fuzzySearchString } },
    );
  };

  const getTaxonomyCondition = taxonomyIds => ({
    '$Services.Taxonomies.id$': { [sequelize.Op.in]: taxonomyIds },
  });

  const getOpeningHoursCondition = (openAt) => {
    const weekday = getDayOfWeekIntegerFromDate(openAt);
    const timeOfDay = formatTime(openAt);
    return {
      '$Services.RegularSchedules.weekday$': weekday,
      '$Services.RegularSchedules.opens_at$': { [sequelize.Op.lte]: timeOfDay },
      '$Services.RegularSchedules.closes_at$': { [sequelize.Op.gt]: timeOfDay },
    };
  };

  const getServiceAreaCondition = zipcode => ({
    '$Services.ServiceAreas.postal_codes$': {
      [sequelize.Op.or]: {
        [sequelize.Op.eq]: null,
        [sequelize.Op.contains]: [zipcode],
      },
    },
  });

  const getEligibilityCondition = (eligibility) => {
    const serviceEligibilities = sequelize.cast(
      sequelize.fn(
        'json_object_agg',
        sequelize.col('"Services->Eligibilities->EligibilityParameter".name'),
        sequelize.col('"Services->Eligibilities".eligible_values'),
      ),
      'jsonb',
    );

    const paramIsUnrestrictedOrAllowsValue = eligibilityParam =>
      sequelize.or(
        sequelize.where(
          sequelize.where(serviceEligibilities, '->', eligibilityParam),
          'is',
          null,
        ),
        sequelize.where(
          sequelize.where(serviceEligibilities, '->', eligibilityParam),
          '?',
          eligibility[eligibilityParam],
        ),
      );
    return sequelize.and(Object.keys(eligibility).map(paramIsUnrestrictedOrAllowsValue));
  };

  const getRequiredDocumentsCondition = (documents) => {
    const serviceRequiredDocuments = sequelize.cast(
      sequelize.fn('json_agg', sequelize.col('"Services->RequiredDocuments".document')),
      'jsonb',
    );

    const requiredDocuments =
      Object.keys(documents).filter(documentName => documents[documentName]);
    const notRequiredDocuments =
      Object.keys(documents).filter(documentName => !documents[documentName]);

    const requiredDocumentCondition = sequelize.and(...requiredDocuments.map(doc =>
      sequelize.where(serviceRequiredDocuments, '?', doc)));
    const notRequiredDocumentCondition = {
      [sequelize.Op.not]: sequelize.or(...notRequiredDocuments.map(doc =>
        sequelize.where(serviceRequiredDocuments, '?', doc))),
    };

    return sequelize.and(requiredDocumentCondition, notRequiredDocumentCondition);
  };

  Location.findUniqueLocationIds = async (filterParameters, additionalConditions, queryProps) => {
    const {
      searchString,
      taxonomyIds,
      openAt,
      zipcode,
      eligibility,
      documents,
    } = filterParameters;
    const isEligibilitySpecified = eligibility && Object.keys(eligibility).length;
    const areRequiredDocsSpecified = documents && Object.keys(documents).length;

    const whereConditions = [];
    if (searchString) {
      whereConditions.push(getSearchStringCondition(searchString));
    }
    if (taxonomyIds) {
      whereConditions.push(getTaxonomyCondition(taxonomyIds));
    }
    if (openAt) {
      whereConditions.push(getOpeningHoursCondition(openAt));
    }
    if (zipcode) {
      whereConditions.push(getServiceAreaCondition(zipcode));
    }

    const havingConditions = [];
    if (isEligibilitySpecified) {
      havingConditions.push(getEligibilityCondition(eligibility));
    }
    if (areRequiredDocsSpecified) {
      havingConditions.push(getRequiredDocumentsCondition(documents));
    }

    const locations = await Location.findAll({
      ...queryProps,
      where: sequelize.and(...whereConditions, ...additionalConditions),
      attributes: [
        sequelize.fn('DISTINCT', sequelize.col('Location.id')),
        // For SELECT DISTINCT, ORDER BY expressions must appear in select list.
        ...(queryProps.order || []),
      ],
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
          required: isEligibilitySpecified,
          include: [
            sequelize.models.Taxonomy,
            ...(areRequiredDocsSpecified ? [sequelize.models.RequiredDocument] : []),
            ...(openAt ? [sequelize.models.RegularSchedule] : []),
            ...(zipcode ? [sequelize.models.ServiceArea] : []),
            ...(isEligibilitySpecified ? [{
              model: sequelize.models.Eligibility,
              include: {
                model: sequelize.models.EligibilityParameter,
                required: true,
              },
              required: true,
            }] : []),
          ],
        },
      ],
      group: ['Location.id', 'Services.id'],
      having: havingConditions,
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
    const distance = sequelize.fn(
      'ST_Distance_Sphere',
      sequelize.col('position'),
      sequelize.literal(`ST_GeomFromGeoJSON('${JSON.stringify(position)}')`),
    );

    const distanceCondition = sequelize.where(distance, { [sequelize.Op.lte]: radius });

    let locationIds = await Location.findUniqueLocationIds(filterParameters, [distanceCondition], {
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
      locationIds = await Location.findUniqueLocationIds(filterParameters, [], {
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
          include: [
            sequelize.models.Taxonomy,
            sequelize.models.RequiredDocument,
          ],
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
