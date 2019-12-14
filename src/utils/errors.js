export class NotFoundError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, NotFoundError);
  }
}

export class AuthError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, AuthError);
  }
}

export class ForbiddenError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, ForbiddenError);
  }
}

export class ValidationError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, ValidationError);
  }
}

export default {
  NotFoundError,
  AuthError,
  ForbiddenError,
  ValidationError,
};
