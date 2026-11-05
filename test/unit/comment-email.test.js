/**
 * Unit tests for comment-email HTML escaping and email generation.
 * nodemailer transport is mocked so no SMTP calls are made.
 */

// eslint-disable-next-line no-var
var mockSendMail; // var is hoisted; factory assigns it so tests can reference it

jest.mock('nodemailer', () => {
  // eslint-disable-next-line no-undef
  mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  return { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) };
});

jest.mock('../../src/config', () => ({
  __esModule: true,
  default: {
    appUrl: 'https://test.yourpeer.nyc',
    mail: {
      host: 'smtp.test',
      port: 587,
      username: 'user',
      password: 'pass',
      from: 'noreply@test.com',
    },
  },
}));

import commentEmail, { replyEmail } from '../../src/services/comment-email';

function captureHtml() {
  return mockSendMail.mock.calls[0][0].html;
}

beforeEach(() => {
  mockSendMail.mockClear();
});

describe('commentEmail — HTML escaping', () => {
  const baseArgs = {
    locationName: 'Safe Haven',
    providersEmail: 'provider@example.com',
    locationSlug: 'safe-haven',
    whatWentWell: null,
    whatCouldBeImproved: null,
    servicesUsed: null,
  };

  it('escapes XSS in locationName', async () => {
    await commentEmail({ ...baseArgs, locationName: '<script>alert(1)</script>' });
    const html = captureHtml();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes XSS in whatWentWell', async () => {
    await commentEmail({ ...baseArgs, whatWentWell: '<img src=x onerror=alert(1)>' });
    const html = captureHtml();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('escapes XSS in whatCouldBeImproved', async () => {
    await commentEmail({ ...baseArgs, whatCouldBeImproved: '"><script>evil()</script>' });
    const html = captureHtml();
    expect(html).toContain('&quot;&gt;&lt;script&gt;evil()&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes XSS in each servicesUsed entry', async () => {
    await commentEmail({
      ...baseArgs,
      servicesUsed: ['Food', '<b>Shelter</b>', "'quote'"],
    });
    const html = captureHtml();
    expect(html).toContain('Food');
    expect(html).toContain('&lt;b&gt;Shelter&lt;/b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&#39;quote&#39;');
  });

  it('URL-encodes locationSlug in the href', async () => {
    await commentEmail({ ...baseArgs, locationSlug: 'test shelter <>&"' });
    const html = captureHtml();
    expect(html).toContain('test%20shelter%20%3C%3E%26%22');
    expect(html).not.toContain('<>&"');
  });
});

describe('replyEmail — HTML escaping', () => {
  it('escapes XSS in replyContent', async () => {
    await replyEmail({
      locationName: 'Test Org',
      toEmail: 'commenter@example.com',
      locationSlug: 'test-org',
      replyContent: '<script>steal(document.cookie)</script>',
    });
    const html = captureHtml();
    expect(html).toContain('&lt;script&gt;steal(document.cookie)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('URL-encodes locationSlug in the href', async () => {
    await replyEmail({
      locationName: 'Test',
      toEmail: 'commenter@example.com',
      locationSlug: 'test org/path?a=1&b=2',
      replyContent: 'Thanks!',
    });
    const html = captureHtml();
    expect(html).toContain('test%20org%2Fpath%3Fa%3D1%26b%3D2');
    expect(html).not.toContain('?a=1&b=2');
  });

  it('rejects an invalid toEmail before sending', async () => {
    await expect(replyEmail({
      locationName: 'Test',
      toEmail: 'not-an-email',
      locationSlug: 'test',
      replyContent: 'Hi',
    })).rejects.toThrow('Invalid recipient email address');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('rejects multiple addresses as toEmail', async () => {
    await expect(replyEmail({
      locationName: 'Test',
      toEmail: 'a@x.com,b@x.com',
      locationSlug: 'test',
      replyContent: 'Hi',
    })).rejects.toThrow('Invalid recipient email address');
  });
});

describe('replyEmail — names the replying location', () => {
  const baseArgs = {
    toEmail: 'commenter@example.com',
    locationSlug: 'lantern-house',
    replyContent: 'Thanks!',
  };

  it('puts the location name in the subject, header and body', async () => {
    await replyEmail({ ...baseArgs, locationName: 'Lantern House' });
    const { subject, html } = mockSendMail.mock.calls[0][0];
    expect(subject).toBe('📝 Lantern House replied to your comment on YourPeer');
    expect(html).toContain('<title>Lantern House replied to your comment on YourPeer</title>');
    expect(html).toContain('<strong>Lantern House</strong> has replied to your comment');
  });

  it('falls back to "A provider" when no location name is given', async () => {
    await replyEmail({ ...baseArgs, locationName: '  ' });
    const { subject, html } = mockSendMail.mock.calls[0][0];
    expect(subject).toBe('📝 A provider replied to your comment on YourPeer!');
    expect(html).toContain('A provider has replied to your comment');
  });

  it('escapes the location name in the HTML but not in the subject', async () => {
    await replyEmail({ ...baseArgs, locationName: 'Tom & Jerry <Shelter>' });
    const { subject, html } = mockSendMail.mock.calls[0][0];
    expect(subject).toBe('📝 Tom & Jerry <Shelter> replied to your comment on YourPeer');
    expect(html).toContain('Tom &amp; Jerry &lt;Shelter&gt;');
    expect(html).not.toContain('<Shelter>');
  });

  it('collapses line breaks in the location name so the subject stays one line', async () => {
    await replyEmail({ ...baseArgs, locationName: 'Lantern\r\nHouse' });
    expect(mockSendMail.mock.calls[0][0].subject)
      .toBe('📝 Lantern House replied to your comment on YourPeer');
  });
});

describe('closing quote stays on the same line as the comment text', () => {
  it('trims surrounding whitespace from replyContent', async () => {
    await replyEmail({
      locationName: 'Lantern House',
      toEmail: 'commenter@example.com',
      locationSlug: 'lantern-house',
      replyContent: '\n  Thanks for the feedback!\n\n',
    });
    expect(captureHtml()).toContain('<div class="comment-box">"Thanks for the feedback!"</div>');
  });

  it('trims trailing whitespace from new-comment fields', async () => {
    await commentEmail({
      locationName: 'Lantern House',
      providersEmail: 'provider@example.com',
      locationSlug: 'lantern-house',
      servicesUsed: null,
      whatWentWell: 'Friendly staff\n',
      whatCouldBeImproved: 'Longer hours\n\n',
    });
    expect(captureHtml()).toContain('What could be improved: Longer hours"</div>');
    expect(captureHtml()).toContain('What went well: Friendly staff\nWhat could be improved');
  });
});
