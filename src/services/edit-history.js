import models from '../models';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 600;
const ACTION_CREATE = 'create';
const ACTION_UPDATE = 'update';
const ACTION_DELETE = 'delete';
const TIMELINE_PAGE_SUFFIXES = new Set(['description', 'other-info']);

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const uniqueStrings = values => [...new Set(values.filter(Boolean).map(value => String(value)))];

const locationPagePath = locationId => `/team/location/${locationId}`;

const servicePagePath = (locationId, serviceId, suffix = '') => {
  const basePath = `${locationPagePath(locationId)}/services/${serviceId}`;
  return suffix ? `${basePath}/${suffix}` : basePath;
};

const stringifyValue = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const parseStoredValue = (value) => {
  if (value == null || value === '') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      return value;
    }
  }
  return value;
};

const humanizeField = (field) => {
  const specialLabels = {
    additional_info: 'Additional info',
    address_1: 'Street',
    postal_code: 'Postal code',
    state_province: 'State',
    organization_id: 'Organization',
    who_does_it_serve: 'Who does it serve',
    ages_served: 'Ages served',
    event_related_info: 'Other info',
    irregular_hours: 'Hours',
  };

  if (specialLabels[field]) {
    return specialLabels[field];
  }

  return String(field || 'Edit')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase());
};

const previewValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(item => previewValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const nestedPreview = [
      value.name,
      value.label,
      value.title,
      value.number,
      value.information,
    ].find(Boolean);
    return previewValue(nestedPreview || '');
  }
  return '';
};

const areEqual = (left, right) => {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left !== 'object' && typeof right !== 'object') {
    return String(left) === String(right);
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (err) {
    return false;
  }
};

const buildSummary = ({
  action, label, before, after,
}) => {
  const title = label || 'Edit';
  const afterPreview = previewValue(after);
  const beforePreview = previewValue(before);

  if (action === ACTION_CREATE) {
    return afterPreview ? `Created ${title}: ${afterPreview}` : `Created ${title}`;
  }

  if (action === ACTION_DELETE) {
    return beforePreview ? `Deleted ${title}: ${beforePreview}` : `Deleted ${title}`;
  }

  if (before == null && after != null) {
    return afterPreview ? `Added ${title}: ${afterPreview}` : `Added ${title}`;
  }

  if (after == null && before != null) {
    return beforePreview ? `Removed ${title}: ${beforePreview}` : `Removed ${title}`;
  }

  return `Updated ${title}`;
};

const buildSegments = (before, after) => {
  if (typeof before !== 'string' || typeof after !== 'string') return null;

  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < (before.length - prefix) &&
    suffix < (after.length - prefix) &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const segments = [];
  const equalPrefix = after.slice(0, prefix);
  const deletedText = before.slice(prefix, before.length - suffix);
  const insertedText = after.slice(prefix, after.length - suffix);
  const equalSuffix = suffix ? after.slice(after.length - suffix) : '';

  if (equalPrefix) segments.push({ op: 'equal', text: equalPrefix });
  if (deletedText) segments.push({ op: 'delete', text: deletedText });
  if (insertedText) segments.push({ op: 'insert', text: insertedText });
  if (equalSuffix) segments.push({ op: 'equal', text: equalSuffix });

  return segments.length ? segments : null;
};

const createEntry = ({
  locationId,
  serviceId = null,
  organizationId = null,
  phoneId = null,
  pagePath,
  userName,
  action,
  field = '',
  label = '',
  before = null,
  after = null,
  summary = '',
  resourceTable,
  resourceId,
  source = null,
  actionAt = new Date(),
}) => ({
  location_id: locationId,
  service_id: serviceId,
  organization_id: organizationId,
  phone_id: phoneId,
  page_path: pagePath,
  user_name: userName || 'Unknown',
  action,
  field,
  label: label || humanizeField(field),
  before_value: stringifyValue(before),
  after_value: stringifyValue(after),
  summary: summary || buildSummary({
    action, label, before, after,
  }),
  resource_table: resourceTable,
  resource_id: String(resourceId),
  source,
  action_at: actionAt,
  copyedit: false,
});

const bulkCreateEntries = async (entries) => {
  if (!entries.length) return [];
  return models.EditHistory.bulkCreate(entries);
};

const loadLocationIdsForOrganization = async (organizationId) => {
  const locations = await models.Location.findAll({
    where: { organization_id: organizationId },
    attributes: ['id'],
    raw: true,
  });
  return uniqueStrings(locations.map(({ id }) => id));
};

const loadLocationIdsForService = async (serviceId) => {
  const locations = await models.ServiceAtLocation.findAll({
    where: { service_id: serviceId },
    attributes: ['location_id'],
    raw: true,
  });
  return uniqueStrings(locations.map(({ location_id: locationId }) => locationId));
};

const resolvePhoneLocationIds = async (phone) => {
  if (phone.location_id) return [String(phone.location_id)];
  if (phone.organization_id) return loadLocationIdsForOrganization(phone.organization_id);
  if (phone.service_id) return loadLocationIdsForService(phone.service_id);
  if (phone.service_at_location_id) {
    const record = await models.ServiceAtLocation.findByPk(phone.service_at_location_id, {
      attributes: ['location_id'],
      raw: true,
    });
    return uniqueStrings([record && record.location_id]);
  }
  return [];
};

const buildLocationFieldEntries = ({
  locationId,
  resourceTable,
  resourceId,
  action,
  userName,
  source,
  actionAt,
  fields,
}) => fields.map(field => createEntry({
  locationId,
  pagePath: locationPagePath(locationId),
  userName,
  action,
  field: field.field,
  label: field.label,
  before: field.before,
  after: field.after,
  summary: field.summary,
  resourceTable,
  resourceId,
  source,
  actionAt,
}));

const buildServiceEntries = ({
  locationIds,
  serviceId,
  action,
  userName,
  source,
  actionAt,
  resourceTable,
  resourceId,
  fields,
}) => {
  const entries = [];
  locationIds.forEach((locationId) => {
    fields.forEach((field) => {
      entries.push(createEntry({
        locationId,
        serviceId,
        pagePath: servicePagePath(locationId, serviceId, field.pageSuffix || ''),
        userName,
        action,
        field: field.field,
        label: field.label,
        before: field.before,
        after: field.after,
        summary: field.summary,
        resourceTable,
        resourceId,
        source,
        actionAt,
      }));
    });
  });
  return entries;
};

const findServiceEventInfo = (serviceBefore, eventName) => {
  const infos = serviceBefore && Array.isArray(serviceBefore.EventRelatedInfos)
    ? serviceBefore.EventRelatedInfos
    : [];
  return infos.find(info => info.event === eventName) || null;
};

const findEligibilityValue = (serviceBefore) => {
  const eligibilities = serviceBefore && Array.isArray(serviceBefore.Eligibilities)
    ? serviceBefore.Eligibilities
    : [];
  const match = eligibilities.find(eligibility =>
    eligibility.EligibilityParameter &&
    eligibility.EligibilityParameter.name === 'age');
  return match ? match.eligible_values : null;
};

const filterMeaningfulRequiredDocuments = (documents = []) =>
  documents
    .map(document => document && document.document)
    .filter(document => document && String(document).trim().toLowerCase() !== 'none');

export const recordLocationCreateHistory = async ({
  location,
  input,
  userName,
  source = 'location-api',
  actionAt = new Date(),
}) => {
  const after = {
    id: location.id,
    name: input.name || location.name || null,
    description: input.description || location.description || null,
    additionalInfo: input.additionalInfo || location.additional_info || null,
  };

  return bulkCreateEntries([
    createEntry({
      locationId: location.id,
      organizationId: location.organization_id,
      pagePath: locationPagePath(location.id),
      userName,
      action: ACTION_CREATE,
      field: 'location',
      label: 'Location',
      before: null,
      after,
      resourceTable: 'locations',
      resourceId: location.id,
      source,
      actionAt,
    }),
  ]);
};

export const recordLocationUpdateHistory = async ({
  locationBefore,
  input,
  userName,
  source = 'location-api',
  actionAt = new Date(),
}) => {
  const fields = [];
  const address = Array.isArray(locationBefore.PhysicalAddresses)
    ? locationBefore.PhysicalAddresses[0]
    : null;

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    fields.push({
      field: 'name',
      label: 'Name',
      before: locationBefore.name,
      after: input.name,
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    fields.push({
      field: 'description',
      label: 'Description',
      before: locationBefore.description,
      after: input.description,
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'additionalInfo')) {
    fields.push({
      field: 'additional_info',
      label: 'Additional info',
      before: locationBefore.additional_info,
      after: input.additionalInfo,
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'organizationId')) {
    fields.push({
      field: 'organization_id',
      label: 'Organization',
      before: locationBefore.organization_id,
      after: input.organizationId,
    });
  }

  if (input.address) {
    [
      ['street', 'address_1', 'Street'],
      ['city', 'city', 'City'],
      ['region', 'region', 'Region'],
      ['state', 'state_province', 'State'],
      ['postalCode', 'postal_code', 'Postal code'],
      ['country', 'country', 'Country'],
    ].forEach(([requestKey, currentKey, label]) => {
      if (Object.prototype.hasOwnProperty.call(input.address, requestKey)) {
        fields.push({
          field: currentKey,
          label,
          before: address && address[currentKey],
          after: input.address[requestKey],
        });
      }
    });
  }

  if (input.eventRelatedInfo) {
    const existingInfo = Array.isArray(locationBefore.EventRelatedInfos)
      ? locationBefore.EventRelatedInfos.find(info => info.event === input.eventRelatedInfo.event)
      : null;

    fields.push({
      field: 'event_related_info',
      label: 'Other info',
      before: existingInfo ? existingInfo.information : null,
      after: input.eventRelatedInfo.information,
    });
  }

  const changedFields = fields.filter(field => !areEqual(field.before, field.after));

  return bulkCreateEntries(buildLocationFieldEntries({
    locationId: locationBefore.id,
    resourceTable: 'locations',
    resourceId: locationBefore.id,
    action: ACTION_UPDATE,
    userName,
    source,
    actionAt,
    fields: changedFields,
  }));
};

export const recordPhoneCreateHistory = async ({
  locationId,
  phone,
  input,
  userName,
  source = 'phone-api',
  actionAt = new Date(),
}) => bulkCreateEntries([
  createEntry({
    locationId,
    phoneId: phone.id,
    pagePath: locationPagePath(locationId),
    userName,
    action: ACTION_CREATE,
    field: 'phone',
    label: 'Phone',
    before: null,
    after: {
      id: phone.id,
      number: input.number,
      extension: input.extension,
      type: input.type,
      description: input.description,
    },
    resourceTable: 'phones',
    resourceId: phone.id,
    source,
    actionAt,
  }),
]);

export const recordPhoneUpdateHistory = async ({
  phoneBefore,
  input,
  userName,
  source = 'phone-api',
  actionAt = new Date(),
}) => {
  const locationIds = await resolvePhoneLocationIds(phoneBefore);
  const fields = ['number', 'extension', 'type', 'language', 'description']
    .filter(field => Object.prototype.hasOwnProperty.call(input, field))
    .map(field => ({
      field,
      label: humanizeField(field),
      before: phoneBefore[field],
      after: input[field],
    }))
    .filter(field => !areEqual(field.before, field.after));

  const entries = [];
  locationIds.forEach((locationId) => {
    fields.forEach((field) => {
      entries.push(createEntry({
        locationId,
        phoneId: phoneBefore.id,
        pagePath: locationPagePath(locationId),
        userName,
        action: ACTION_UPDATE,
        field: field.field,
        label: field.label,
        before: field.before,
        after: field.after,
        resourceTable: 'phones',
        resourceId: phoneBefore.id,
        source,
        actionAt,
      }));
    });
  });

  return bulkCreateEntries(entries);
};

export const recordPhoneDeleteHistory = async ({
  phoneBefore,
  userName,
  source = 'phone-api',
  actionAt = new Date(),
}) => {
  const locationIds = await resolvePhoneLocationIds(phoneBefore);
  const entries = locationIds.map(locationId => createEntry({
    locationId,
    phoneId: phoneBefore.id,
    pagePath: locationPagePath(locationId),
    userName,
    action: ACTION_DELETE,
    field: 'phone',
    label: 'Phone',
    before: {
      id: phoneBefore.id,
      number: phoneBefore.number,
      extension: phoneBefore.extension,
      type: phoneBefore.type,
      description: phoneBefore.description,
    },
    after: null,
    resourceTable: 'phones',
    resourceId: phoneBefore.id,
    source,
    actionAt,
  }));

  return bulkCreateEntries(entries);
};

export const recordOrganizationUpdateHistory = async ({
  organization,
  input,
  userName,
  source = 'organization-api',
  actionAt = new Date(),
}) => {
  const locationIds = await loadLocationIdsForOrganization(organization.id);
  const fieldDefs = ['name', 'description', 'url']
    .filter(field => Object.prototype.hasOwnProperty.call(input, field))
    .map(field => ({
      field,
      label: humanizeField(field),
      before: organization[field],
      after: input[field],
    }))
    .filter(field => !areEqual(field.before, field.after));

  const entries = [];
  locationIds.forEach((locationId) => {
    fieldDefs.forEach((field) => {
      entries.push(createEntry({
        locationId,
        organizationId: organization.id,
        pagePath: locationPagePath(locationId),
        userName,
        action: ACTION_UPDATE,
        field: field.field,
        label: field.label,
        before: field.before,
        after: field.after,
        resourceTable: 'organizations',
        resourceId: organization.id,
        source,
        actionAt,
      }));
    });
  });

  return bulkCreateEntries(entries);
};

export const recordServiceCreateHistory = async ({
  locationId,
  service,
  input,
  userName,
  source = 'service-api',
  actionAt = new Date(),
}) => {
  const entries = [
    createEntry({
      locationId,
      serviceId: service.id,
      organizationId: service.organization_id,
      pagePath: servicePagePath(locationId, service.id),
      userName,
      action: ACTION_CREATE,
      field: 'service',
      label: 'Service',
      before: null,
      after: {
        id: service.id,
        name: input.name || service.name || null,
      },
      resourceTable: 'services',
      resourceId: service.id,
      source,
      actionAt,
    }),
  ];

  if (input.description != null) {
    entries.push(createEntry({
      locationId,
      serviceId: service.id,
      organizationId: service.organization_id,
      pagePath: servicePagePath(locationId, service.id, 'description'),
      userName,
      action: ACTION_CREATE,
      field: 'description',
      label: 'Description',
      before: '',
      after: input.description,
      resourceTable: 'services',
      resourceId: service.id,
      source,
      actionAt,
    }));
  }

  return bulkCreateEntries(entries);
};

export const recordServiceUpdateHistory = async ({
  serviceBefore,
  input,
  userName,
  source = 'service-api',
  actionAt = new Date(),
}) => {
  const locationIds = uniqueStrings((serviceBefore.Locations || []).map(location => location.id));
  if (!locationIds.length) return [];

  const fields = [];

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    fields.push({
      field: 'name',
      label: 'Name',
      before: serviceBefore.name,
      after: input.name,
      pageSuffix: '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    fields.push({
      field: 'description',
      label: 'Description',
      before: serviceBefore.description,
      after: input.description,
      pageSuffix: 'description',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'url')) {
    fields.push({
      field: 'url',
      label: 'URL',
      before: serviceBefore.url,
      after: input.url,
      pageSuffix: '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'additionalInfo')) {
    fields.push({
      field: 'additional_info',
      label: 'Additional info',
      before: serviceBefore.additional_info,
      after: input.additionalInfo,
      pageSuffix: '',
    });
  }

  if (input.eventRelatedInfo) {
    const existingInfo = findServiceEventInfo(serviceBefore, input.eventRelatedInfo.event);
    fields.push({
      field: 'additional_info',
      label: 'Other info',
      before: existingInfo ? existingInfo.information : null,
      after: input.eventRelatedInfo.information,
      pageSuffix: 'other-info',
    });
  }

  if (input.documents && Object.prototype.hasOwnProperty.call(input.documents, 'proofs')) {
    fields.push({
      field: 'required_documents',
      label: 'Required documents',
      before: filterMeaningfulRequiredDocuments(serviceBefore.RequiredDocuments || []),
      after: input.documents.proofs,
      pageSuffix: 'documents/proofs-required',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'whoDoesItServe')) {
    fields.push({
      field: 'who_does_it_serve',
      label: 'Who does it serve',
      before: serviceBefore.who_does_it_serve || findEligibilityValue(serviceBefore),
      after: input.whoDoesItServe,
      pageSuffix: 'who-does-it-serve',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'irregularHours')) {
    fields.push({
      field: 'irregular_hours',
      label: 'Hours',
      before: serviceBefore.HolidaySchedules || [],
      after: input.irregularHours,
      pageSuffix: 'opening-hours',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'hours')) {
    fields.push({
      field: 'hours',
      label: 'Hours',
      before: serviceBefore.RegularSchedules || [],
      after: input.hours,
      pageSuffix: 'opening-hours',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'languageIds')) {
    fields.push({
      field: 'language_ids',
      label: 'Languages',
      before: (serviceBefore.Languages || []).map(language => language.id),
      after: input.languageIds,
      pageSuffix: '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'taxonomyId')) {
    fields.push({
      field: 'taxonomy_id',
      label: 'Taxonomy',
      before: (serviceBefore.Taxonomies || []).map(taxonomy => taxonomy.id),
      after: input.taxonomyId,
      pageSuffix: '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'agesServed')) {
    fields.push({
      field: 'ages_served',
      label: 'Ages served',
      before: serviceBefore.ages_served,
      after: input.agesServed,
      pageSuffix: '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, 'area')) {
    fields.push({
      field: 'service_area',
      label: 'Service area',
      before: (serviceBefore.ServiceAreas || []).map(area => area.postal_codes),
      after: input.area,
      pageSuffix: '',
    });
  }

  if (!fields.length) {
    fields.push({
      field: 'service',
      label: 'Service',
      before: null,
      after: input,
      pageSuffix: '',
      summary: 'Updated service',
    });
  }

  const changedFields = fields.filter(field =>
    field.summary === 'Updated service' || !areEqual(field.before, field.after));

  return bulkCreateEntries(buildServiceEntries({
    locationIds,
    serviceId: serviceBefore.id,
    action: ACTION_UPDATE,
    userName,
    source,
    actionAt,
    resourceTable: 'services',
    resourceId: serviceBefore.id,
    fields: changedFields,
  }));
};

export const recordServiceDeleteHistory = async ({
  serviceBefore,
  userName,
  source = 'service-api',
  actionAt = new Date(),
}) => {
  const locationIds = uniqueStrings((serviceBefore.Locations || []).map(location => location.id));
  if (!locationIds.length) return [];

  const before = {
    id: serviceBefore.id,
    name: serviceBefore.name,
  };

  return bulkCreateEntries(buildServiceEntries({
    locationIds,
    serviceId: serviceBefore.id,
    action: ACTION_DELETE,
    userName,
    source,
    actionAt,
    resourceTable: 'services',
    resourceId: serviceBefore.id,
    fields: [{
      field: 'service',
      label: 'Service',
      before,
      after: null,
      pageSuffix: '',
    }],
  }));
};

const mapEntryToEvent = (entry, { includeSegments = false } = {}) => {
  const before = parseStoredValue(entry.before_value);
  const after = parseStoredValue(entry.after_value);
  const timestamp = new Date(entry.action_at || entry.createdAt || new Date());
  const event = {
    type: 'edit',
    kind: entry.action,
    action: entry.action,
    field: entry.field || '',
    label: entry.label || humanizeField(entry.field),
    before,
    after,
    summary: entry.summary,
    note: entry.summary,
    ts: timestamp.toISOString(),
    timestamp: timestamp.toISOString(),
    timestampMs: timestamp.getTime(),
    userName: entry.user_name,
    user: entry.user_name,
    pagePath: entry.page_path,
    locationId: entry.location_id,
    serviceId: entry.service_id || '',
    phoneId: entry.phone_id || '',
    resourceTable: entry.resource_table,
    resourceId: entry.resource_id,
    source: entry.source || null,
    copyedit: Boolean(entry.copyedit),
  };

  if (entry.page_path && /\/description$/i.test(entry.page_path)) {
    event.fieldKey = 'services.description';
  } else if (entry.page_path && /\/other-info$/i.test(entry.page_path)) {
    event.fieldKey = 'services.additional_info';
  }

  if (
    includeSegments &&
    typeof before === 'string' &&
    typeof after === 'string' &&
    before !== after
  ) {
    const segments = buildSegments(before, after);
    if (segments) event.segments = segments;
  }

  return event;
};

const loadLocationEntries = async ({ locationId, limit }) => models.EditHistory.findAll({
  where: { location_id: locationId },
  order: [['action_at', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
  limit,
});

export const getLocationEditHistory = async ({ locationId, limit, includeSegments = false }) => {
  const normalizedLimit = normalizeLimit(limit);
  const entries = await loadLocationEntries({ locationId, limit: normalizedLimit });
  const edits = entries.map(entry => mapEntryToEvent(entry, { includeSegments }));

  return {
    ok: true,
    locationId,
    edits,
    count: edits.length,
    generatedAt: new Date().toISOString(),
  };
};

export const getLocationEditTimeline = async ({ locationId, limit, includeSegments = false }) => {
  const normalizedLimit = normalizeLimit(limit);
  const entries = await loadLocationEntries({ locationId, limit: normalizedLimit });
  const events = entries
    .map(entry => mapEntryToEvent(entry, { includeSegments }))
    .filter((event) => {
      const suffix = String(event.pagePath || '').split('/').pop();
      return TIMELINE_PAGE_SUFFIXES.has(suffix);
    })
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const pages = {};
  events.forEach((event) => {
    const key = encodeURIComponent(event.pagePath);
    if (!pages[key]) {
      pages[key] = {
        pagePath: event.pagePath,
        fieldKey: event.fieldKey || '',
        label: event.label || '',
        events: [],
      };
    }
    pages[key].events.push(event);
  });

  return {
    ok: true,
    locationId,
    generatedAt: new Date().toISOString(),
    pages,
  };
};

export const getCurrentUserEditHistory = async ({ userName, limit }) => {
  const normalizedLimit = normalizeLimit(limit);
  const entries = await models.EditHistory.findAll({
    where: { user_name: userName },
    order: [['action_at', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
    limit: normalizedLimit,
  });

  const data = {};
  entries.forEach((entry) => {
    const event = mapEntryToEvent(entry);
    if (!data[event.pagePath]) {
      data[event.pagePath] = {};
    }

    let timestamp = event.timestampMs;
    while (Object.prototype.hasOwnProperty.call(data[event.pagePath], String(timestamp))) {
      timestamp += 1;
    }

    data[event.pagePath][String(timestamp)] = event;
  });

  return {
    user: {
      key: userName,
      name: userName,
      normalized: userName,
    },
    data,
  };
};

export default {
  getCurrentUserEditHistory,
  getLocationEditHistory,
  getLocationEditTimeline,
  recordLocationCreateHistory,
  recordLocationUpdateHistory,
  recordOrganizationUpdateHistory,
  recordPhoneCreateHistory,
  recordPhoneDeleteHistory,
  recordPhoneUpdateHistory,
  recordServiceCreateHistory,
  recordServiceDeleteHistory,
  recordServiceUpdateHistory,
};
