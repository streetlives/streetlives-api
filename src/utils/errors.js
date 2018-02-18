export class BadRequestError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, BadRequestError);
  }
}

export class NotFoundError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, NotFoundError);
  }
}

export default {
  BadRequestError,
  NotFoundError,
};
