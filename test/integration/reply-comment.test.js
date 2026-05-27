/**
 * @jest-environment node
 *
 * Unit-style tests for the reply handler's email side-effects.
 * Models and the email service are mocked so no DB or SMTP calls are made;
 * the DB is still set up by test/setup.js for the rest of the suite.
 */

import commentsController from '../../src/controllers/comments';
import { replyEmail } from '../../src/services/comment-email';
import models from '../../src/models';
import { createInstance } from '../../src/services/data-changes';

jest.mock('../../src/services/comment-email', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  replyEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/data-changes', () => ({
  __esModule: true,
  createInstance: jest.fn().mockResolvedValue({ id: 'reply-1', content: 'test reply' }),
  destroyInstance: jest.fn().mockResolvedValue(undefined),
  updateInstance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/models', () => ({
  __esModule: true,
  default: {
    Comment: { findByPk: jest.fn() },
    Location: {},
    Organization: {},
  },
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  ListUsersCommand: jest.fn(),
}));

jest.mock('../../src/controllers/comment-highlights', () => ({
  __esModule: true,
  regenerateHighlightsForLocation: jest.fn().mockResolvedValue(undefined),
}));

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const LOCATION_SLUG = 'test-shelter';

function makeOriginalComment(contactInfo) {
  return {
    id: COMMENT_ID,
    contact_info: contactInfo,
    location_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    Location: {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      slug: LOCATION_SLUG,
      organization_id: ORG_ID,
      Organization: { name: 'Test Shelter' },
    },
    createReply: jest.fn().mockResolvedValue({}),
  };
}

function makeReq(bodyOverrides = {}) {
  return {
    params: { commentId: COMMENT_ID },
    body: { content: 'Thank you for your feedback.', postedBy: 'Staff', ...bodyOverrides },
    user: 'test-user',
    userOrganizationIds: [ORG_ID],
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('comments.reply — email side-effects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createInstance.mockResolvedValue({ id: 'reply-1', content: 'Thank you for your feedback.' });
  });

  it('sends a reply email when contact_info is a valid email address', async () => {
    const email = 'commenter@example.com';
    models.Comment.findByPk.mockResolvedValue(makeOriginalComment(email));

    const res = makeRes();
    await commentsController.reply(makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(replyEmail).toHaveBeenCalledWith(expect.objectContaining({
      toEmail: email,
      locationSlug: LOCATION_SLUG,
      replyContent: 'Thank you for your feedback.',
    }));
  });

  it('does not send a reply email when contact_info is a plain name', async () => {
    models.Comment.findByPk.mockResolvedValue(makeOriginalComment('John Smith'));

    const res = makeRes();
    await commentsController.reply(makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(replyEmail).not.toHaveBeenCalled();
  });

  it('does not send a reply email when contact_info is absent', async () => {
    models.Comment.findByPk.mockResolvedValue(makeOriginalComment(null));

    const res = makeRes();
    await commentsController.reply(makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(replyEmail).not.toHaveBeenCalled();
  });

  it('does not send a reply email when contact_info contains multiple addresses', async () => {
    models.Comment.findByPk.mockResolvedValue(
      makeOriginalComment('a@example.com,b@example.com'),
    );

    const res = makeRes();
    await commentsController.reply(makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(replyEmail).not.toHaveBeenCalled();
  });

  it('returns 201 and does not call next(err) when email delivery fails', async () => {
    models.Comment.findByPk.mockResolvedValue(makeOriginalComment('commenter@example.com'));
    replyEmail.mockRejectedValueOnce(new Error('SMTP failure'));

    const res = makeRes();
    const next = jest.fn();
    await commentsController.reply(makeReq(), res, next);

    // Let the fire-and-forget .catch() settle
    await new Promise(resolve => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
  });
});
