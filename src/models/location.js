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
    streetview_url: DataTypes.TEXT,
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
    Location.hasMany(models.LocationSlugRedirect, { foreignKey: 'location_id' });

    // Can't just set defaultScope on the initial model definition:
    // https://github.com/sequelize/sequelize/issues/6245.
    Location.addScope('defaultScope', {
      attributes: { exclude: ['hidden_from_search'] },
    }, { override: true });
  };

  const getCombinedFuzzySearchCondition = (col, searchString) => {
    // Break the search string into individual words (tokens)
    const searchTokens = searchString.split(' ').map(token => token.toLowerCase());
    // Create a condition that checks phonetic similarity and edit distance for each token
    const conditions = searchTokens.map(token =>
      sequelize.or(
        // Soundex-based condition (phonetic similarity)
        // sequelize.where(
        //   sequelize.fn(
        //     'difference',
        //     sequelize.fn('soundex', sequelize.col(col)),
        //     sequelize.fn('soundex', token),
        //   ),
        //   4, // Maximum similarity score for Soundex
        // ),
        // Levenshtein-based condition (edit distance <= 2)
        sequelize.where(
          sequelize.fn('levenshtein', sequelize.fn('lower', sequelize.col(col)), token),
          { [Op.lte]: 2 }, // Allowing for up to 2-character differences
        ),
        // Like operator for partial matches
        sequelize.where(sequelize.fn('lower', sequelize.col(col)), { [Op.like]: `%${token}%` }),
      ));
    // Combine all conditions into one using Sequelize's `or` and `and`
    return sequelize.and(...conditions);
  };

  function getPhoneNumberCondition(text) {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return { '$Phones.number$': text };

    // eslint-disable-next-line max-len
    return sequelize.where(sequelize.fn('regexp_replace', sequelize.col('Phones.number'), '[^0-9]', '', 'g'), {
      [Op.like]: `%${digits}%`,
    });
  }

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

  const getAgeCondition = ({ ageMin, ageMax }) => {
    assert(
      ageMin != null || ageMax != null,
      'age filter must include at least a minimum or maximum value',
    );
    if (ageMin != null) {
      assert(typeof ageMin === 'number', 'ageMin parameter must be a number');
    }
    if (ageMax != null) {
      assert(typeof ageMax === 'number', 'ageMax parameter must be a number');
    }

    const requestedMin = ageMin != null ? ageMin : 'NULL';
    const requestedMax = ageMax != null ? ageMax : 'NULL';

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
                 (age_min is null OR ${requestedMax} is null OR age_min <= ${requestedMax}) AND
                 (age_max is null OR ${requestedMin} is null OR age_max >= ${requestedMin})
               )
          )
      )
    `);
  };

  const getEligibilityCondition = ({ age, ageRange, ...eligibility }) => {
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
    originalQueryProps = {},
    selectedAttributeForOrderBy, noServices) => {
    const queryProps = { order: originalQueryProps.order };
    // eslint-disable-next-line prefer-destructuring
    const limit = originalQueryProps.limit;
    // eslint-disable-next-line prefer-destructuring
    const offset = originalQueryProps.offset;
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
    const isEligibilitySpecified = eligibility &&
      Object.keys(eligibility).some(param => !['age', 'ageRange'].includes(param));
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
    // eslint-disable-next-line no-nested-ternary
    const ageFilter = eligibility && eligibility.age != null
      ? { ageMin: eligibility.age, ageMax: eligibility.age }
      : (eligibility && eligibility.ageRange ? eligibility.ageRange : null);

    if (ageFilter && (ageFilter.ageMin != null || ageFilter.ageMax != null)) {
      havingConditions.push(getAgeCondition(ageFilter));
    }
    const shouldJoinEligibilities = isEligibilitySpecified || !!ageFilter;

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
          sequelize.models.PhysicalAddress,
          sequelize.models.Phone,
          {
            model: sequelize.models.Service,
            required: !noServices,
            include: [
              sequelize.models.Taxonomy,
              ...(areRequiredDocsSpecified ? [sequelize.models.RequiredDocument] : []),
              ...((openAt && !occasion) ? [sequelize.models.RegularSchedule] : []),
              ...(occasion ? [sequelize.models.HolidaySchedule] : []),
              ...(servesZipcode ? [sequelize.models.ServiceArea] : []),
              ...(shouldJoinEligibilities ? [{
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
      // whereConditions.push(getZipcodesCondition([searchString]));

      const websearchToTsqueryCondition = {
        [Op.match]:
        sequelize.fn('websearch_to_tsquery', 'english', searchString),
      };
      const prefixCondition = { [Op.iRegexp]: `(^|\\b)${searchString}.*$` };
      const exactMatchCondition = { [Op.iRegexp]: `(^|\\b)${searchString}(\\b|$)` };
      const exactExactMatchCondition = { [Op.iLike]: searchString };

      // eslint-disable-next-line no-inner-declarations, no-shadow
      function parseZipCodes(searchString) {
        return searchString
          .split(/[,\s]+/)
          .map(z => z.trim())
          .filter(z => z.length > 0);
      }

      const zipCodeCondition = { [Op.in]: parseZipCodes(searchString) };

      // TODO: optimize this by stepping through the conditions until we have enough results
      locations = [
        await findWithCondition({ '$PhysicalAddresses.postal_code$': zipCodeCondition }),
        await findWithCondition(getPhoneNumberCondition(searchString)),

        await findWithCondition({ '$Organization.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Organization.name$': prefixCondition }),
        await findWithCondition({ '$Organization.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition(getCombinedFuzzySearchCondition('Organization.name', searchString)),
        await findWithCondition({ '$Location.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Location.name$': prefixCondition }),
        await findWithCondition({ '$Location.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition(getCombinedFuzzySearchCondition('Location.name', searchString)),

        await findWithCondition({ '$Services.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': exactExactMatchCondition }),
        await findWithCondition({ '$Organization.name$': exactMatchCondition }),
        await findWithCondition({ '$Location.name$': exactMatchCondition }),
        await findWithCondition({ '$Services.name$': exactMatchCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': exactMatchCondition }),

        // prefix match
        await findWithCondition({ '$Services.name$': prefixCondition }),
        await findWithCondition({ '$Services.Taxonomies.name$': prefixCondition }),

        // full-text search
        await findWithCondition({ '$Services.name_vector$': websearchToTsqueryCondition }),
        await findWithCondition({
          '$Services.Taxonomies.name_vector$': websearchToTsqueryCondition,
        }),

        await findWithCondition(getCombinedFuzzySearchCondition('Services.name', searchString)),
        await findWithCondition(getCombinedFuzzySearchCondition(
          'Services->Taxonomies.name',
          searchString,
        )),
        // full text search on the description
        await findWithCondition({ '$Services.description_vector$': websearchToTsqueryCondition }),

      ].reduce((a, b) => a.concat(b));
    } else {
      locations = await findAll(whereConditions);
    }

    // apply limit and offset in memory here
    locations = locations.slice(offset || 0, limit ? (offset || 0) + limit : undefined);

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
    noServices,
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
    } else if (sortBy === SORT_ORDER.MOST_SERVICES) {
      order = [[sequelize.literal(SERVICE_COUNT_COLUMN_ALIAS), 'DESC']];
      selectedAttributeForOrderBy = SERVICE_COUNT_SUBQUERY;
    } else if (filterParameters.searchString) {
      // if search string is specified, use default sort order
      order = null;
      selectedAttributeForOrderBy = null;
    } else if (!sortBy || sortBy === SORT_ORDER.MOST_RECENTLY_VALIDATED) {
      order = [['last_validated_at', 'DESC']];
      selectedAttributeForOrderBy = 'last_validated_at';
    }

    if (radius && position) {
      const distanceCondition = sequelize.where(distance, { [Op.lte]: radius });

      totalNumLocations = (await Location.findUniqueLocationIds(
        filterParameters,
        [distanceCondition],
      )).length;

      locationIds = await Location.findUniqueLocationIds(
        filterParameters,
        [distanceCondition].filter(Boolean), {
          order,
          limit,
          offset,
        },
        selectedAttributeForOrderBy,
        noServices,
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
        }, selectedAttributeForOrderBy, noServices);
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
      attributes: {
        include: selectedAttributeForOrderBy ? [selectedAttributeForOrderBy] : undefined,
      },
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
