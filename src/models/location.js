import assert from 'assert';
import { SORT_ORDER } from '../controllers/sort-by';
import { getDayOfWeekIntegerFromDate, formatTime } from '../utils/times';

module.exports = (sequelize, DataTypes, Op) => {
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
    slug: DataTypes.TEXT,
    last_validated_at: DataTypes.DATE,
    name_vector: DataTypes.TSVECTOR,
  }, {
    underscored: true,
    underscoredAll: true,
    hooks: {
      beforeFind: (options) => {
        if (options && options.where) {
          const isSearchingBySpecificId = options.where.id != null;
          if (!isSearchingBySpecificId) {
            // Mutating args is awful, but is how sequelize hooks officially work:
            // http://docs.sequelizejs.com/manual/tutorial/hooks.html.
            // eslint-disable-next-line no-param-reassign
            options.where.hidden_from_search = { [Op.or]: [false, null] };
          }
        }
        return options;
      },
    },
  });

  const SERVICE_COUNT_COLUMN_ALIAS = 'service_count';

  const SERVICE_COUNT_SUBQUERY = [
    sequelize.literal(`(
                SELECT cast(COUNT(*) as integer)
                FROM service_at_locations
                WHERE service_at_locations.location_id = "Location"."id"
            )`),
    SERVICE_COUNT_COLUMN_ALIAS,
  ];

  Location.associate = (models) => {
    Location.belongsTo(models.Organization, { foreignKey: 'organization_id' });
    Location.belongsToMany(models.Service, {
      through: models.ServiceAtLocation,
      foreignKey: 'location_id',
      otherKey: 'service_id',
    });
    Location.belongsToMany(models.Language, {
      through: models.LocationLanguages,
      foreignKey: 'location_id',
      otherKey: 'language_id',
    });
    Location.hasMany(models.PhysicalAddress, { foreignKey: 'location_id' });
    Location.hasMany(models.Phone, { foreignKey: 'location_id' });
    Location.hasMany(models.RegularSchedule, { foreignKey: 'location_id' });
    Location.hasMany(models.HolidaySchedule, { foreignKey: 'location_id' });
    Location.hasMany(models.AccessibilityForDisabilities, { foreignKey: 'location_id' });
    Location.hasMany(models.EventRelatedInfo, { foreignKey: 'location_id' });
    Location.hasMany(models.Comment, { foreignKey: 'location_id' });
    Location.hasMany(models.ErrorReport, { foreignKey: 'location_id' });

    // Can't just set defaultScope on the initial model definition:
    // https://github.com/sequelize/sequelize/issues/6245.
    Location.addScope('defaultScope', {
      attributes: { exclude: ['hidden_from_search'] },
    }, { override: true });
  };

  const getLevenshteinCondition = (col, searchString) =>
    sequelize.where(
      sequelize.fn(
        'levenshtein',
        sequelize.fn('lower', sequelize.col(col)),
        searchString.toLowerCase(),
      ),
      { [Op.lte]: 2 },
    );

  const getSoundexCondition = (col, searchString) =>
    sequelize.where(
      sequelize.fn('difference', sequelize.col(col), searchString),
      4,
    );

  const getOrganizationNameCondition = organizationName => ({
    '$Organization.name$': { [Op.iLike]: `%${organizationName}%` },
  });

  const getZipcodesCondition = zipcodes => ({
    '$PhysicalAddresses.postal_code$': { [Op.in]: zipcodes },
  });

  const getTaxonomyCondition = taxonomyIds => ({
    '$Services.Taxonomies.id$': { [Op.in]: taxonomyIds },
  });

  const getOpeningHoursCondition = (openAt, occasion) => {
    // For now, all opening hours are assumed to be in New York time (EST/DST depending on date).
    // Once we have locations elsewhere, the Google Time Zone API can give us a TZ per position
    // (or we just store the timezone with the hours).
    const openingHoursTimezone = 'America/New_York';

    const weekday = getDayOfWeekIntegerFromDate(openAt);
    const timeOfDay = formatTime(openAt, openingHoursTimezone);

    if (occasion) {
      return {
        '$Services.HolidaySchedules.occasion$': occasion,
        '$Services.HolidaySchedules.weekday$': weekday,
        '$Services.HolidaySchedules.opens_at$': { [Op.lte]: timeOfDay },
        '$Services.HolidaySchedules.closes_at$': { [Op.gt]: timeOfDay },
        '$Services.HolidaySchedules.closed$': { [Op.or]: [false, null] },
      };
    }

    return {
      '$Services.RegularSchedules.weekday$': weekday,
      '$Services.RegularSchedules.opens_at$': { [Op.lte]: timeOfDay },
      '$Services.RegularSchedules.closes_at$': { [Op.gt]: timeOfDay },
    };
  };

  const getServiceAreaCondition = zipcode => sequelize.or(
    sequelize.where(
      sequelize.col('"Services->ServiceAreas".id'),
      'is',
      null,
    ),
    {
      '$Services.ServiceAreas.postal_codes$': {
        [Op.or]: {
          [Op.contains]: [zipcode],
          [Op.eq]: '{}',
        },
      },
    },
  );

  const getOccasionCondition = occasion => ({
    '$Services.HolidaySchedules.occasion$': occasion,
  });

  const ageAgg = `
    (
      jsonb_object_agg(
        "Services->Eligibilities->EligibilityParameter".name,
        "Services->Eligibilities".eligible_values
      ) -> 'age'
    )
  `;

  const getAgeCondition = (age) => {
    // I believe this type check makes the subsequent literal replacement safe wrt sql injection
    assert(typeof age === 'number', 'age parameter must be a number');
    return sequelize.literal(`
      (
        select
          -- either no age eligibility criteria are listed for service, OR
          ${ageAgg} is null OR
          -- age eligibility is listed AND 
          -- exists at least one eligibility that fulfills the following criteria:
          EXISTS (
            select *
            from jsonb_populate_recordset(null::age_eligibility, ${ageAgg})
            where
               -- all ages, OR
               -- age is greater than min age and less than max age, OR
               -- age is less than max age and min age is null, OR
               -- age is greater than min age and max age is null
               (all_ages is not null and all_ages) OR
               (
                 (age_min is null OR ${age} >= age_min) AND
                 (age_max is null OR ${age} <= age_max)
               )
          )
      )
    `);
  };

  const getEligibilityCondition = ({ age, ...eligibility }) => {
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

  const getTaxonomySpecificAttributesCondition = (requestedAttributes) => {
    const serviceAttributes = sequelize.cast(
      sequelize.fn(
        'json_object_agg',
        sequelize.col('"Services->ServiceTaxonomySpecificAttributes->attribute"'
          + '.name'),
        sequelize.col('"Services->ServiceTaxonomySpecificAttributes".values'),
      ),
      'jsonb',
    );

    const attributeIncludesRequestedValue = name =>
      sequelize.where(
        sequelize.where(serviceAttributes, '->', name),
        '?',
        requestedAttributes[name],
      );

    return sequelize.and([
      // Yes, this is absolutely nonsensical: https://github.com/sequelize/sequelize/issues/10142.
      {},
      ...Object.keys(requestedAttributes).map(attributeIncludesRequestedValue),
    ]);
  };

  const getRequiredDocumentsCondition = (documents) => {
    const serviceRequiredDocuments = sequelize.cast(
      sequelize.fn(
        'json_agg',
        sequelize.fn('lower', sequelize.col('"Services->RequiredDocuments".document')),
      ),
      'jsonb',
    );

    const requiredDocuments =
      Object.keys(documents).filter(documentName => documents[documentName]);
    const notRequiredDocuments =
      Object.keys(documents).filter(documentName => !documents[documentName]);

    const requiredDocumentCondition = sequelize.and(...requiredDocuments.map(doc =>
      sequelize.where(serviceRequiredDocuments, '?', doc.toLowerCase())));
    const notRequiredDocumentCondition = {
      [Op.not]: sequelize.or(...notRequiredDocuments.map(doc =>
        sequelize.where(serviceRequiredDocuments, '?', doc.toLowerCase()))),
    };

    return sequelize.and(requiredDocumentCondition, notRequiredDocumentCondition);
  };

  Location.findUniqueLocationIds = async (filterParameters,
    additionalConditions,
    queryProps = {},
    selectedAttributeForOrderBy) => {
    const {
      searchString,
      organizationName,
      zipcodes,
      taxonomyIds,
      openAt,
      occasion,
      servesZipcode,
      eligibility,
      documents,
      taxonomySpecificAttributes,
    } = filterParameters;
    const isEligibilitySpecified = eligibility && Object.keys(eligibility).length;
    const areRequiredDocsSpecified = documents && Object.keys(documents).length;
    const areTaxonomyAttributesSpecified =
      taxonomySpecificAttributes && Object.keys(taxonomySpecificAttributes).length;

    const whereConditions = [];
    if (organizationName) {
      whereConditions.push(getOrganizationNameCondition(organizationName));
    }
    if (zipcodes) {
      whereConditions.push(getZipcodesCondition(zipcodes));
    }
    if (taxonomyIds) {
      whereConditions.push(getTaxonomyCondition(taxonomyIds));
    }
    if (openAt) {
      whereConditions.push(getOpeningHoursCondition(openAt, occasion));
    }
    if (servesZipcode) {
      whereConditions.push(getServiceAreaCondition(servesZipcode));
    }
    if (occasion) {
      whereConditions.push(getOccasionCondition(occasion));
    }

    // we put empty object in the having array to work around this bug in sequelize:
    // https://github.com/sequelize/sequelize/issues/10142
    const havingConditions = [{}];
    if (eligibility.age != null) {
      havingConditions.push(getAgeCondition(eligibility.age));
    }
    if (isEligibilitySpecified) {
      havingConditions.push(getEligibilityCondition(eligibility));
    }
    if (areRequiredDocsSpecified) {
      havingConditions.push(getRequiredDocumentsCondition(documents));
    }
    if (areTaxonomyAttributesSpecified) {
      havingConditions.push(getTaxonomySpecificAttributesCondition(taxonomySpecificAttributes));
    }

    async function findAll(_whereConditions) {
      return Location.findAll({
        ...queryProps,
        where: sequelize.and(..._whereConditions, ...additionalConditions),
        attributes: [
          sequelize.fn('DISTINCT', sequelize.col('Location.id')),
          // For SELECT DISTINCT, ORDER BY expressions must appear in select list.
          ...(selectedAttributeForOrderBy ? [selectedAttributeForOrderBy] : []),
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
          ...(zipcodes ? [sequelize.models.PhysicalAddress] : []),
          {
            model: sequelize.models.Service,
            required: true,
            include: [
              sequelize.models.Taxonomy,
              ...(areRequiredDocsSpecified ? [sequelize.models.RequiredDocument] : []),
              ...((openAt && !occasion) ? [sequelize.models.RegularSchedule] : []),
              ...(occasion ? [sequelize.models.HolidaySchedule] : []),
              ...(servesZipcode ? [sequelize.models.ServiceArea] : []),
              ...(isEligibilitySpecified ? [{
                model: sequelize.models.Eligibility,
                include: {
                  model: sequelize.models.EligibilityParameter,
                  required: true,
                },
                required: true,
              }] : []),
              ...(areTaxonomyAttributesSpecified ? [{
                model: sequelize.models.ServiceTaxonomySpecificAttribute,
                include: {
                  model: sequelize.models.TaxonomySpecificAttribute,
                  as: 'attribute',
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
    }

    async function findWithCondition(condition) {
      return findAll(whereConditions.concat(condition));
    }

    let locations;
    if (searchString) {
      const websearchToTsqueryCondition = {
        [Op.match]:
        sequelize.fn('websearch_to_tsquery', 'english', searchString),
      };
      const prefixCondition = { [Op.iRegexp]: `(^|\\b)${searchString}.*$` };
      const exactMatchCondition = { [Op.iRegexp]: `(^|\\b)${searchString}(\\b|$)` };
      const exactExactMatchCondition = { [Op.iLike]: searchString };
      locations = [
        await findWithCondition({ '$Organization.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Location.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Services.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': exactExactMatchCondition }),

        // exact match
        await findWithCondition({ '$Organization.name$': exactMatchCondition }),
        await findWithCondition({ '$Location.name$': exactMatchCondition }),
        await findWithCondition({ '$Services.name$': exactMatchCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': exactMatchCondition }),

        // prefix match
        await findWithCondition({ '$Organization.name$': prefixCondition }),
        await findWithCondition({ '$Location.name$': prefixCondition }),
        await findWithCondition({ '$Services.name$': prefixCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': prefixCondition }),

        // full-text search
        await findWithCondition({ '$Organization.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition({ '$Location.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition({ '$Services.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition({
          '$Services.Taxonomies.name_vector$': websearchToTsqueryCondition,
        }),

        // levenshtein fuzzy match
        await findWithCondition(getLevenshteinCondition('Organization.name', searchString)),
        await findWithCondition(getLevenshteinCondition('Location.name', searchString)),
        await findWithCondition(getLevenshteinCondition('Services.name', searchString)),
        await findWithCondition(getLevenshteinCondition('Services->Taxonomies.name', searchString)),

        // soundex fuzzy match
        await findWithCondition(getSoundexCondition('Organization.name', searchString)),
        await findWithCondition(getSoundexCondition('Location.name', searchString)),
        await findWithCondition(getSoundexCondition('Services.name', searchString)),
        await findWithCondition(getSoundexCondition('Services->Taxonomies.name', searchString)),

        // full text search on the description
        await findWithCondition({ '$Services.description_vector$': websearchToTsqueryCondition }),

      ].reduce((a, b) => a.concat(b));
    } else {
      locations = await findAll(whereConditions);
    }

    return locations.map(location => location.id);
  };

  Location.search = async ({
    position,
    radius,
    minResults,
    filterParameters,
    locationFieldsOnly,
    limit,
    offset,
    sortBy,
  }) => {
    let locationIds;
    let distance;
    let totalNumLocations;
    // order is used to specify the attribute referenced in the ORDER BY
    let order;
    // selectedAttributeForOrderBy is the attribute in the select statement
    let selectedAttributeForOrderBy;

    if (position) {
      distance = sequelize.fn(
        'ST_DistanceSphere',
        sequelize.col('position'),
        sequelize.literal(`ST_GeomFromGeoJSON('${JSON.stringify(position)}')`),
      );
    }

    if (position && sortBy === SORT_ORDER.NEARBY) {
      order = [[distance, 'ASC']];
      selectedAttributeForOrderBy = distance;
    } else if (sortBy === SORT_ORDER.MOST_RECENTLY_VALIDATED) {
      order = [['last_validated_at', 'DESC']];
      selectedAttributeForOrderBy = 'last_validated_at';
    } else if (sortBy === SORT_ORDER.MOST_SERVICES) {
      order = [[sequelize.literal(SERVICE_COUNT_COLUMN_ALIAS), 'DESC']];
      selectedAttributeForOrderBy = SERVICE_COUNT_SUBQUERY;
    }

    if (radius && position) {
      const distanceCondition = sequelize.where(distance, { [Op.lte]: radius });

      totalNumLocations = (await Location.findUniqueLocationIds(
        filterParameters,
        [distanceCondition],
      )).length;

      locationIds = await Location.findUniqueLocationIds(
        filterParameters,
        [distanceCondition], {
          order,
          limit,
          offset,
        },
        selectedAttributeForOrderBy,
      );

      // Note: We could avoid having 2 separate queries if we were to first order by distance
      // and assign row numbers per this order, then filter the rows not just by distance but by:
      // "distance < radius OR row_number <= minResults".
      // However, filtering by window functions requires nested queries, which
      // aren't natively supported by sequelize and would require a raw query.
      // For now, the simplicity and security of sequelize seems worth the slight performance hit.
      if (minResults && locationIds.length < minResults) {
        totalNumLocations = (await Location.findUniqueLocationIds(filterParameters, [])).length;
        locationIds = await Location.findUniqueLocationIds(filterParameters, [], {
          order,
          limit: minResults,
          offset,
        }, selectedAttributeForOrderBy);
      }
    } else {
      totalNumLocations = (await Location.findUniqueLocationIds(filterParameters, [])).length;
      locationIds = await Location.findUniqueLocationIds(filterParameters, [], {
        limit,
        offset,
        order,
      }, selectedAttributeForOrderBy);
    }

    const additionalLocationData = locationFieldsOnly ? [
      sequelize.models.EventRelatedInfo,
      {
        model: sequelize.models.Service,
        include: [
          sequelize.models.HolidaySchedule,
        ],
      },
    ] : [
      sequelize.models.Organization,
      sequelize.models.EventRelatedInfo,
      {
        model: sequelize.models.Service,
        include: [
          sequelize.models.Taxonomy,
          sequelize.models.RequiredDocument,
          sequelize.models.HolidaySchedule,
        ],
      },
      sequelize.models.Phone,
      sequelize.models.PhysicalAddress,
    ];

    const locationsWithAssociations = await Location.findAll({
      attributes: [
        'id',
        'name',
        'description',
        'transportation',
        'position',
        'additional_info',
        'hidden_from_search',
        'slug',
        'last_validated_at',
        SERVICE_COUNT_SUBQUERY,
      ],
      where: { id: { [Op.in]: locationIds } },
      include: additionalLocationData,
      order,
    });

    function sortByLocationIds(a, b) {
      return locationIds.indexOf(a.id) - locationIds.indexOf(b.id);
    }

    const sortedLocationsWithAssociations = order ?
      locationsWithAssociations :
      locationsWithAssociations.sort(sortByLocationIds);

    return {
      locations: sortedLocationsWithAssociations,
      totalNumLocations,
    };
  };

  return Location;
};
