import changeFeedAuth from '../../src/middleware/change-feed-auth';
import { AuthError, ForbiddenError, ValidationError } from '../../src/utils/errors';
import {
  EMPTY_UUID,
  decodeChangeFeedCursor,
  encodeChangeFeedCursor,
  resolveChangeFeedPosition,
} from '../../src/utils/change-feed-cursor';

describe('changeFeedAuth', () => {
  const previous = process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS;
  afterEach(() => { process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = previous || ''; });

  const run = (claims) => {
    const req = claims
      ? { apiGateway: { event: { requestContext: { authorizer: { claims } } } } }
      : {};
    let result;
    changeFeedAuth(req, {}, (err) => { result = err; });
    return result;
  };

  it('lets a listed client through', () => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = 'first, mirror-client';
    expect(run({ client_id: 'mirror-client', token_use: 'access' })).toBeUndefined();
  });

  it('rejects a request API Gateway did not authorize', () => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = 'mirror-client';
    expect(run(null)).toBeInstanceOf(AuthError);
  });

  it('rejects a signed-in user, whose token names the user pool client', () => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = 'mirror-client';
    expect(run({ sub: 'user-1', aud: 'mirror-client', token_use: 'id' }))
      .toBeInstanceOf(ForbiddenError);
  });

  it('rejects everyone while no client is configured', () => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = '';
    expect(run({ client_id: 'mirror-client' })).toBeInstanceOf(ForbiddenError);
  });

  it('matches the whole client id, not part of it', () => {
    process.env.CHANGE_FEED_ALLOWED_CLIENT_IDS = 'mirror-client';
    expect(run({ client_id: 'mirror' })).toBeInstanceOf(ForbiddenError);
  });
});

describe('change feed cursor', () => {
  const id = '6f1c2a40-5b7e-4c8d-9a01-23456789abcd';

  it('round-trips microsecond timestamps exactly', () => {
    const position = { at: '2026-11-01T12:00:00.123456Z', id };
    expect(decodeChangeFeedCursor(encodeChangeFeedCursor(position))).toEqual(position);
  });

  it('is safe to put in a query string', () => {
    expect(encodeChangeFeedCursor({ at: '2026-11-01T12:00:00.999999Z', id }))
      .toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects anything it did not produce', () => {
    expect(() => decodeChangeFeedCursor('not-a-cursor')).toThrow(ValidationError);
    expect(() => decodeChangeFeedCursor(Buffer.from(`2026-11-01|${id}`).toString('base64')))
      .toThrow(ValidationError);
    expect(() => decodeChangeFeedCursor(encodeChangeFeedCursor({
      at: '2026-11-01T12:00:00Z', id: "x'; DROP TABLE metadata; --",
    }))).toThrow(ValidationError);
  });

  it('starts at `since` inclusive when there is no cursor', () => {
    expect(resolveChangeFeedPosition({ since: '2026-11-01T12:00:00.000Z' }))
      .toEqual({ at: '2026-11-01T12:00:00.000Z', id: EMPTY_UUID });
  });

  it('prefers the cursor to `since`', () => {
    const cursor = encodeChangeFeedCursor({ at: '2026-11-01T13:00:00.5Z', id });
    expect(resolveChangeFeedPosition({ since: '2026-11-01T12:00:00Z', cursor }))
      .toEqual({ at: '2026-11-01T13:00:00.5Z', id });
  });
});
