import { AuthError } from '../utils/errors';
import { getUserClaims, applyUserContext } from './user-context';

export default function getUser(req, res, next) {
  if (applyUserContext(req, getUserClaims(req))) {
    next();
    return;
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    req.user = '<Anonymous>';
    next();
  } else {
    next(new AuthError());
  }
}
