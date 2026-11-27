// Fills the /locations-by-slug cache ahead of visitors, so the first visit to a location is a hit
// too. Entries already cached are current by design (writes drop what they change), so they are
// skipped; pass `flush` to rebuild everything, e.g. after a deploy that changes the response.
//
// Runs locally as `npm run cache:warm`, and in a deployed environment by invoking the Lambda
// directly with {"cacheTask": "warm"} (src/lambda.js) - ElastiCache is only reachable from
// inside the VPC. A Lambda invocation has a time limit, so the work is resumable: it goes through
// slugs in order, stops at `deadline`, and returns the slug to continue after.
import models from '../models';
import {
  connect,
  flushLocations,
  getCachedLocationResponse,
  setCachedLocationResponse,
} from './cache';
import { buildLocationResponseBySlug } from '../controllers/locations';

export const warmLocationCache = async ({
  flush = false,
  startAfter = null,
  deadline = Infinity,
} = {}) => {
  if (!(await connect())) {
    throw new Error('cache: not enabled or not reachable (check CACHE_ENABLED and CACHE_URL)');
  }

  const result = {
    flushed: null, warmed: 0, alreadyCached: 0, failed: [], next: null,
  };
  if (flush && !startAfter) {
    result.flushed = await flushLocations();
  }

  const where = { slug: { [models.Sequelize.Op.ne]: null } };
  if (startAfter) {
    where.slug[models.Sequelize.Op.gt] = startAfter;
  }
  const slugs = (await models.Location.findAll({
    where,
    attributes: ['slug'],
    order: [['slug', 'ASC']],
    raw: true,
  })).map(row => row.slug);

  // One at a time: the connection pool has a single connection (RDS Proxy pinning, CLAUDE.md),
  // and this must not crowd out the visitors it is warming the cache for.
  for (let i = 0; i < slugs.length; i += 1) {
    if (Date.now() >= deadline) {
      result.next = slugs[i - 1] || startAfter;
      break;
    }
    const slug = slugs[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const { token, value } = await getCachedLocationResponse(slug);
      if (value) {
        result.alreadyCached += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const built = await buildLocationResponseBySlug(slug);
        // eslint-disable-next-line no-await-in-loop
        if (built && await setCachedLocationResponse(token, built.body, built.expiresAt)) {
          result.warmed += 1;
        } else {
          result.failed.push(slug);
        }
      }
    } catch (err) {
      result.failed.push(slug);
    }
  }

  return result;
};

export default warmLocationCache;
