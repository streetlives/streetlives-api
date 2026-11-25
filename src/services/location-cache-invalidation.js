// Works out which cached /locations-by-slug responses a write affects, and drops exactly those
// once the write commits (src/services/cache.js explains the cache itself).
//
// data-changes.js calls trackWrite for every row it creates, updates or deletes. A row leads to
// locations through its own id (locations, organizations, services, service_at_locations) or
// through the link columns it carries - the same paths the change feed follows
// (src/services/location-changes.js). Updates record both the old and the new values, so moving
// a phone from one location to another drops both.
//
// Creates and updates are resolved after commit, when the rows they point at certainly exist.
// Deletes are resolved straight away, inside the transaction and before the row goes: once a
// service is deleted, so are the service_at_locations rows that tied it to its locations, and a
// deleted location's slug goes with it.
//
// A location's slug changes when its name or address does (database triggers, see the
// location-slugs migration), and the old one moves to location_slug_redirects. So the slugs
// dropped for a location are its current slug and every old one.
//
// A write to a model this file doesn't know falls back to flushing every cached location: when a
// new table turns up in the response, the cost of forgetting to map it is a cold cache, not
// stale data served forever.
import models from '../models';
import config from '../config';
import { invalidateLocationSlugs, flushLocations } from './cache';

const LINK_FIELDS = {
  location_id: 'locationIds',
  service_id: 'serviceIds',
  service_at_location_id: 'salIds',
  organization_id: 'organizationIds',
};

// Models whose own id leads to locations.
const SELF_LINKS = {
  Location: 'locationIds',
  Organization: 'organizationIds',
  Service: 'serviceIds',
  ServiceAtLocation: 'salIds',
};

// Rows that never appear in a /locations-by-slug response, even when they carry a location_id.
const NOT_IN_RESPONSE = new Set([
  'Comment',
  'CommentLike',
  'ErrorReport',
  'LocationCommentHighlight',
  'LocationSlugRedirect',
  'LocationSuggestion',
  'Metadata',
  'OpenaiRateLimitState',
  'PaymentAccepted',
]);

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const states = new WeakMap();

const emptyRefs = () => ({
  locationIds: new Set(),
  organizationIds: new Set(),
  serviceIds: new Set(),
  salIds: new Set(),
});

const refsOf = (modelName, values) => {
  const refs = emptyRefs();
  if (!values) {
    return refs;
  }
  if (SELF_LINKS[modelName] && UUID.test(values.id)) {
    refs[SELF_LINKS[modelName]].add(values.id);
  }
  Object.entries(LINK_FIELDS).forEach(([field, kind]) => {
    if (UUID.test(values[field])) {
      refs[kind].add(values[field]);
    }
  });
  return refs;
};

const isEmpty = refs => Object.values(refs).every(set => !set.size);

const mergeInto = (target, refs) => {
  Object.keys(target).forEach(kind => refs[kind].forEach(id => target[kind].add(id)));
};

const resolveLocationIds = async (refs, transaction) => {
  if (isEmpty(refs)) {
    return [];
  }
  const [rows] = await models.sequelize.query(`
    SELECT id AS location_id FROM locations
      WHERE id = ANY($1::uuid[]) OR organization_id = ANY($2::uuid[])
    UNION
    SELECT location_id FROM service_at_locations
      WHERE service_id = ANY($3::uuid[]) OR id = ANY($4::uuid[])
  `, {
    bind: ['locationIds', 'organizationIds', 'serviceIds', 'salIds'].map(kind => [...refs[kind]]),
    transaction,
  });
  return rows.map(row => row.location_id).filter(Boolean);
};

const resolveSlugs = async (locationIds, transaction) => {
  if (!locationIds.length) {
    return [];
  }
  const [rows] = await models.sequelize.query(`
    SELECT slug FROM locations WHERE id = ANY($1::uuid[]) AND slug IS NOT NULL
    UNION
    SELECT slug FROM location_slug_redirects WHERE location_id = ANY($1::uuid[])
  `, { bind: [locationIds], transaction });
  return rows.map(row => row.slug);
};

const afterCommit = state => async () => {
  // Runs inside Sequelize's commit(), which awaits it: a throw here would turn a committed write
  // into a 500, so nothing escapes.
  try {
    if (state.flushAll) {
      await flushLocations();
      return;
    }
    const locationIds = new Set([
      ...state.locationIds,
      ...(await resolveLocationIds(state.refs)),
    ]);
    const slugs = [...state.slugs, ...(await resolveSlugs([...locationIds]))];
    await invalidateLocationSlugs(slugs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`cache: invalidation after commit failed; affected locations stay cached: ${
      err.message}`);
  }
};

const stateFor = (transaction) => {
  let state = states.get(transaction);
  if (!state) {
    state = {
      refs: emptyRefs(), locationIds: new Set(), slugs: new Set(), flushAll: false,
    };
    states.set(transaction, state);
    transaction.afterCommit(afterCommit(state));
  }
  return state;
};

const modelNameOf = model => (model && model.name) || 'unknown';

// Records a create or update for invalidation after `transaction` commits. `valueSets` are the
// row's values (for an update, both before and after).
export const trackWrite = (transaction, model, ...valueSets) => {
  if (!config.cache.enabled) {
    return;
  }
  const modelName = modelNameOf(model);
  if (NOT_IN_RESPONSE.has(modelName)) {
    return;
  }
  const state = stateFor(transaction);
  valueSets.forEach((values) => {
    const refs = refsOf(modelName, values);
    if (isEmpty(refs)) {
      state.flushAll = true;
    }
    mergeInto(state.refs, refs);
  });
};

// Records rows about to be deleted. Resolves their locations and slugs now, inside the
// transaction, while the rows that lead to them still exist.
export const trackDelete = async (transaction, model, valueSets) => {
  if (!config.cache.enabled) {
    return;
  }
  const modelName = modelNameOf(model);
  if (NOT_IN_RESPONSE.has(modelName)) {
    return;
  }
  const state = stateFor(transaction);
  const refs = emptyRefs();
  valueSets.forEach((values) => {
    const rowRefs = refsOf(modelName, values);
    if (isEmpty(rowRefs)) {
      state.flushAll = true;
    }
    mergeInto(refs, rowRefs);
  });
  try {
    const locationIds = await resolveLocationIds(refs, transaction);
    locationIds.forEach(id => state.locationIds.add(id));
    (await resolveSlugs(locationIds, transaction)).forEach(slug => state.slugs.add(slug));
  } catch (err) {
    // Not worth failing the delete over; flushing everything is the safe fallback. (A failed
    // query does abort the transaction in Postgres, so the delete will fail anyway in that case.)
    state.flushAll = true;
  }
};
