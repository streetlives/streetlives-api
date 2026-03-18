import models from '../models';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const EMPTY_CURSOR_ID = '00000000-0000-0000-0000-000000000000';

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const uniqueStrings = values => [...new Set(values.filter(Boolean).map(String))];

const readMetadataLocationFallback = (change) => {
  if (change.field_name === 'location_id') {
    return change.replacement_value || change.previous_value || null;
  }
  return change.previous_value || change.replacement_value || null;
};

export const serializeLocationChangesCursor = ({ createdAt, changeId = EMPTY_CURSOR_ID }) => {
  const normalizedDate = normalizeDate(createdAt);
  if (!normalizedDate) {
    return null;
  }
  return `${normalizedDate.toISOString()}|${changeId || EMPTY_CURSOR_ID}`;
};

export const parseLocationChangesCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  const [createdAtText, changeId] = cursor.split('|');
  const createdAt = normalizeDate(createdAtText);
  if (!createdAt) {
    return null;
  }

  return {
    createdAt,
    changeId: changeId || EMPTY_CURSOR_ID,
  };
};

const resolveRequestedCursor = ({ cursor, since }) => {
  const parsedCursor = parseLocationChangesCursor(cursor);
  if (parsedCursor) {
    return parsedCursor;
  }

  const sinceDate = normalizeDate(since);
  if (sinceDate) {
    return {
      createdAt: sinceDate,
      changeId: EMPTY_CURSOR_ID,
    };
  }

  return {
    createdAt: new Date(),
    changeId: EMPTY_CURSOR_ID,
  };
};

const makeResolverContext = () => ({
  locationIdsByOrganizationId: new Map(),
  locationIdsByServiceId: new Map(),
  locationIdsByServiceAtLocationId: new Map(),
  locationIdsByModelAndId: new Map(),
});

const cacheModelLookup = async (context, cacheKey, load) => {
  if (context.locationIdsByModelAndId.has(cacheKey)) {
    return context.locationIdsByModelAndId.get(cacheKey);
  }
  const value = uniqueStrings(await load());
  context.locationIdsByModelAndId.set(cacheKey, value);
  return value;
};

const getOrganizationLocationIds = async (organizationId, context) => {
  const normalizedId = organizationId ? String(organizationId) : '';
  if (!normalizedId) return [];
  if (context.locationIdsByOrganizationId.has(normalizedId)) {
    return context.locationIdsByOrganizationId.get(normalizedId);
  }

  const locations = await models.Location.findAll({
    where: { organization_id: normalizedId },
    attributes: ['id'],
    raw: true,
    hooks: false,
  });
  const locationIds = uniqueStrings(locations.map(({ id }) => id));
  context.locationIdsByOrganizationId.set(normalizedId, locationIds);
  return locationIds;
};

const getServiceLocationIds = async (serviceId, context) => {
  const normalizedId = serviceId ? String(serviceId) : '';
  if (!normalizedId) return [];
  if (context.locationIdsByServiceId.has(normalizedId)) {
    return context.locationIdsByServiceId.get(normalizedId);
  }

  const serviceAtLocations = await models.ServiceAtLocation.findAll({
    where: { service_id: normalizedId },
    attributes: ['location_id'],
    raw: true,
  });
  const locationIds = uniqueStrings(serviceAtLocations
    .map(serviceAtLocation => serviceAtLocation.location_id));
  context.locationIdsByServiceId.set(normalizedId, locationIds);
  return locationIds;
};

const getServiceAtLocationIds = async (serviceAtLocationId, context) => {
  const normalizedId = serviceAtLocationId ? String(serviceAtLocationId) : '';
  if (!normalizedId) return [];
  if (context.locationIdsByServiceAtLocationId.has(normalizedId)) {
    return context.locationIdsByServiceAtLocationId.get(normalizedId);
  }

  const record = await models.ServiceAtLocation.findByPk(normalizedId, {
    attributes: ['location_id'],
    raw: true,
  });
  const locationIds = uniqueStrings([record && record.location_id]);
  context.locationIdsByServiceAtLocationId.set(normalizedId, locationIds);
  return locationIds;
};

const getDirectLocationIds = async (
  context,
  resourceTable,
  resourceId,
  model,
  foreignKey = 'location_id',
) =>
  cacheModelLookup(context, `${resourceTable}:${resourceId}`, async () => {
    const record = await model.findByPk(resourceId, {
      attributes: [foreignKey],
      raw: true,
    });
    return [record && record[foreignKey]];
  });

const getOrganizationBackedLocationIds = async (context, resourceTable, resourceId, model) =>
  cacheModelLookup(context, `${resourceTable}:${resourceId}`, async () => {
    const record = await model.findByPk(resourceId, {
      attributes: ['organization_id'],
      raw: true,
    });
    return getOrganizationLocationIds(record && record.organization_id, context);
  });

const getServiceBackedLocationIds = async (context, resourceTable, resourceId, model) =>
  cacheModelLookup(context, `${resourceTable}:${resourceId}`, async () => {
    const record = await model.findByPk(resourceId, {
      attributes: ['service_id'],
      raw: true,
    });
    return getServiceLocationIds(record && record.service_id, context);
  });

const getScheduleBackedLocationIds = async (context, resourceTable, resourceId, model) =>
  cacheModelLookup(context, `${resourceTable}:${resourceId}`, async () => {
    const record = await model.findByPk(resourceId, {
      attributes: ['location_id', 'service_id', 'service_at_location_id'],
      raw: true,
    });

    return uniqueStrings([
      record && record.location_id,
      ...(await getServiceAtLocationIds(record && record.service_at_location_id, context)),
      ...(await getServiceLocationIds(record && record.service_id, context)),
    ]);
  });

const getPersistedPhoneLocationIds = async (resourceId, context) =>
  cacheModelLookup(context, `phones:${resourceId}`, async () => {
    const phone = await models.Phone.findByPk(resourceId, {
      attributes: ['location_id', 'service_id', 'service_at_location_id', 'organization_id'],
      raw: true,
    });

    return uniqueStrings([
      phone && phone.location_id,
      ...(await getServiceAtLocationIds(phone && phone.service_at_location_id, context)),
      ...(await getServiceLocationIds(phone && phone.service_id, context)),
      ...(await getOrganizationLocationIds(phone && phone.organization_id, context)),
    ]);
  });

const getPhoneLocationIds = async (change, context) =>
  uniqueStrings([
    ...(await getPersistedPhoneLocationIds(change.resource_id, context)),
    readMetadataLocationFallback(change),
  ]);

const getEventRelatedInfoLocationIds = async (resourceId, context) =>
  cacheModelLookup(context, `event_related_info:${resourceId}`, async () => {
    const record = await models.EventRelatedInfo.findByPk(resourceId, {
      attributes: ['location_id', 'service_id'],
      raw: true,
    });

    return uniqueStrings([
      record && record.location_id,
      ...(await getServiceLocationIds(record && record.service_id, context)),
    ]);
  });

const resolveLocationIdsForChange = async (change, context) => {
  switch (change.resource_table) {
    case 'locations':
      return uniqueStrings([change.resource_id]);
    case 'organizations':
      return getOrganizationLocationIds(change.resource_id, context);
    case 'physical_addresses':
      return getDirectLocationIds(
        context,
        'physical_addresses',
        change.resource_id,
        models.PhysicalAddress,
      );
    case 'accessibility_for_disabilities':
      return getDirectLocationIds(
        context,
        'accessibility_for_disabilities',
        change.resource_id,
        models.AccessibilityForDisabilities,
      );
    case 'location_languages':
      return getDirectLocationIds(
        context,
        'location_languages',
        change.resource_id,
        models.LocationLanguages,
      );
    case 'phones':
      return getPhoneLocationIds(change, context);
    case 'event_related_info':
      return getEventRelatedInfoLocationIds(change.resource_id, context);
    case 'services':
      return getServiceLocationIds(change.resource_id, context);
    case 'service_at_locations':
      return uniqueStrings([
        ...(await getServiceAtLocationIds(change.resource_id, context)),
        readMetadataLocationFallback(change),
      ]);
    case 'regular_schedules':
      return getScheduleBackedLocationIds(
        context,
        'regular_schedules',
        change.resource_id,
        models.RegularSchedule,
      );
    case 'holiday_schedules':
      return getScheduleBackedLocationIds(
        context,
        'holiday_schedules',
        change.resource_id,
        models.HolidaySchedule,
      );
    case 'service_areas':
      return getServiceBackedLocationIds(
        context,
        'service_areas',
        change.resource_id,
        models.ServiceArea,
      );
    case 'eligibility':
      return getServiceBackedLocationIds(
        context,
        'eligibility',
        change.resource_id,
        models.Eligibility,
      );
    case 'service_taxonomy_specific_attributes':
      return getServiceBackedLocationIds(
        context,
        'service_taxonomy_specific_attributes',
        change.resource_id,
        models.ServiceTaxonomySpecificAttribute,
      );
    case 'required_documents':
      return getServiceBackedLocationIds(
        context,
        'required_documents',
        change.resource_id,
        models.RequiredDocument,
      );
    case 'documents_infos':
      return getServiceBackedLocationIds(
        context,
        'documents_infos',
        change.resource_id,
        models.DocumentsInfo,
      );
    case 'service_languages':
      return getServiceBackedLocationIds(
        context,
        'service_languages',
        change.resource_id,
        models.ServiceLanguages,
      );
    case 'service_taxonomy':
      return getServiceBackedLocationIds(
        context,
        'service_taxonomy',
        change.resource_id,
        models.ServiceTaxonomy,
      );
    case 'comments':
      return getDirectLocationIds(context, 'comments', change.resource_id, models.Comment);
    case 'error_reports':
      return getDirectLocationIds(context, 'error_reports', change.resource_id, models.ErrorReport);
    case 'organization_phones':
      return getOrganizationBackedLocationIds(
        context,
        'organization_phones',
        change.resource_id,
        models.Phone,
      );
    default:
      return [];
  }
};

const fetchMetadataChanges = ({ createdAt, changeId, limit }) =>
  models.sequelize.query(
    `
      select *
      from metadata
      where (
        created_at > $1
        or (created_at = $1 and id > $2)
      )
      order by created_at asc, id asc
      limit $3
    `,
    {
      bind: [createdAt.toISOString(), changeId, limit + 1],
      type: models.Sequelize.QueryTypes.SELECT,
    },
  );

export const getLocationChanges = async ({ cursor, since, limit } = {}) => {
  const requestedCursor = resolveRequestedCursor({ cursor, since });
  const normalizedLimit = normalizeLimit(limit);
  const rows = await fetchMetadataChanges({
    createdAt: requestedCursor.createdAt,
    changeId: requestedCursor.changeId,
    limit: normalizedLimit,
  });
  const hasMore = rows.length > normalizedLimit;
  const trimmedRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const context = makeResolverContext();
  const expandedChanges = [];

  for (const row of trimmedRows) {
    const locationIds = await resolveLocationIdsForChange(row, context);
    locationIds.forEach((locationId) => {
      expandedChanges.push({
        cursor: serializeLocationChangesCursor({
          createdAt: row.created_at,
          changeId: row.id,
        }),
        locationId,
        changedAt: row.created_at,
        actionAt: row.last_action_date,
        actionType: row.last_action_type,
        resourceTable: row.resource_table,
        resourceId: row.resource_id,
        fieldName: row.field_name,
        source: row.source || null,
      });
    });
  }

  const nextCursor = trimmedRows.length
    ? serializeLocationChangesCursor({
      createdAt: trimmedRows[trimmedRows.length - 1].created_at,
      changeId: trimmedRows[trimmedRows.length - 1].id,
    })
    : serializeLocationChangesCursor(requestedCursor);

  return {
    changes: expandedChanges,
    locationIds: uniqueStrings(expandedChanges.map(({ locationId }) => locationId)),
    nextCursor,
    hasMore,
    serverTime: new Date().toISOString(),
  };
};

export default {
  getLocationChanges,
  parseLocationChangesCursor,
  serializeLocationChangesCursor,
};
