import { ForbiddenError } from '../utils/errors';

export default function dataEntryAuth(req, res, next) {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  if (req.body.metadata && !req.userIsAdmin) {
    next(new ForbiddenError('Only admins are allowed to specify custom metadata for data changes'));
  } else {
    next();
  }
}
