import { getUserClaims, applyUserContext } from './user-context';

export default function getUserIfPresent(req, res, next) {
  applyUserContext(req, getUserClaims(req));
  next();
}
