import { ForbiddenError } from '../utils/errors';
import { assertDataEntryScope } from '../services/organization-scope';

const METADATA_ERROR = 'Only admins are allowed to specify custom metadata for data changes';

const isLocalEnvironment = () =>
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export default async function dataEntryAuth(req, res, next) {
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
    await assertDataEntryScope(req);

    next();
  } catch (err) {
    next(err);
  }
}
