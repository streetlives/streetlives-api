import { ForbiddenError } from '../utils/errors';
import { assertDataEntryScope } from '../services/organization-scope';

const METADATA_ERROR = 'Only admins are allowed to specify custom metadata for data changes';

const isLocalEnvironment = () =>
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

/**
 * `bodyFields` names the body fields this route actually reads to decide which
 * organization it writes to. It is an allowlist: a field a route ignores must
 * not be able to contribute scope, or a caller could attach one they do hold
 * and have the controller act on something else entirely. A route that opts in
 * to nothing is authorized on its params alone.
 */
export default function dataEntryAuth(bodyFields = []) {
  return async function checkDataEntryAuth(req, res, next) {
    try {
      // Locally there is no Cognito authorizer, so there are no claims to check
      // the metadata rule against - see get-user.
      if (!isLocalEnvironment()) {
        if (req.body && req.body.metadata && !req.userIsAdmin) {
          throw new ForbiddenError(METADATA_ERROR);
        }
      }

      // Runs in every environment: without a Cognito authorizer no caller is
      // flagged as a provider, so this is a no-op locally rather than a bypass.
      await assertDataEntryScope(req, bodyFields);

      next();
    } catch (err) {
      next(err);
    }
  };
}
