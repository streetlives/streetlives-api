// Best-effort redaction of common PII formats from free-text search queries
// before they are sent to the OpenAI API for natural-language parsing
// (see `parseNaturalLanguageQuery` in controllers/openai.js).
//
// This is a data-minimization control, not a privacy guarantee: it targets
// structured, high-confidence patterns (emails, phone numbers incl.
// international, SSNs formatted and unformatted, card-like numbers) plus a
// catch-all for any other long digit run (passport/account/national-ID
// numbers etc). It cannot reliably detect free-text PII such as names.
//
// Street addresses are deliberately NOT redacted: the NL parser is designed
// to extract them (e.g. "food near 123 Main St" needs the address to locate
// the search), so sending a user-typed address is expected, in-scope
// behavior rather than an omission. See PRIVACY.md for the documented data
// flow and consent/notice expectations this implies for callers of this API.
const EMAIL_RE = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g;
const INTL_PHONE_RE = /\+\d{1,3}[\d\s().-]{6,17}\d/g;
const US_PHONE_RE = /\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const DASHED_SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const UNFORMATTED_SSN_RE = /\b\d{9}\b/g;
const CARD_RE = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}\b/g;
const LONG_DIGIT_RUN_RE = /\d{7,}/g;

// Order matters: more specific patterns run first so their placeholders
// (letters, not digits) are inert against the broader passes that follow.
export const redactPii = text => text
  .replace(EMAIL_RE, '[EMAIL]')
  .replace(INTL_PHONE_RE, '[PHONE]')
  .replace(US_PHONE_RE, '[PHONE]')
  .replace(DASHED_SSN_RE, '[SSN]')
  .replace(UNFORMATTED_SSN_RE, '[SSN]')
  .replace(CARD_RE, '[CARD]')
  .replace(LONG_DIGIT_RUN_RE, '[NUMBER]');

export default redactPii;
