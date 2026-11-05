/**
 * @jest-environment node
 */

// Tests for redactPii in src/utils/redact-pii.js: the data-minimization pass
// applied to naturalLanguageQuery before it is sent to the OpenAI API.

const { redactPii } = require('../../src/utils/redact-pii');

describe('redactPii', () => {
  describe('emails', () => {
    it('redacts a simple email address', () => {
      expect(redactPii('reach me at me@example.com please'))
        .toBe('reach me at [EMAIL] please');
    });

    it('redacts an email with a plus tag and subdomain without eating trailing punctuation', () => {
      expect(redactPii('contact bob.smith+test@sub.example.co.uk, thanks'))
        .toBe('contact [EMAIL], thanks');
    });
  });

  describe('phone numbers', () => {
    it('redacts a dashed US phone number', () => {
      expect(redactPii('call 212-555-1234 now')).toBe('call [PHONE] now');
    });

    it('redacts an unformatted US phone number', () => {
      expect(redactPii('call 2125551234 now')).toBe('call [PHONE] now');
    });

    it('redacts a parenthesized US phone number', () => {
      expect(redactPii('call (212) 555-1234 now')).toBe('call [PHONE] now');
    });

    it('redacts a dotted US phone number', () => {
      expect(redactPii('call 212.555.1234 now')).toBe('call [PHONE] now');
    });

    it('redacts international numbers with a country code', () => {
      expect(redactPii('call +44 20 7946 0958 now')).toBe('call [PHONE] now');
      expect(redactPii('call +1 (212) 555-1234 now')).toBe('call [PHONE] now');
      expect(redactPii('call +91-98765-43210 now')).toBe('call [PHONE] now');
    });
  });

  describe('SSNs', () => {
    it('redacts a dashed SSN', () => {
      expect(redactPii('ssn 123-45-6789 on file')).toBe('ssn [SSN] on file');
    });

    it('redacts an unformatted 9-digit SSN', () => {
      expect(redactPii('ssn 123456789 on file')).toBe('ssn [SSN] on file');
    });
  });

  describe('card-like numbers', () => {
    it('redacts a spaced 16-digit card number', () => {
      expect(redactPii('card 4111 1111 1111 1111 exp'))
        .toBe('card [CARD] exp');
    });

    it('redacts an unformatted 16-digit card number', () => {
      expect(redactPii('card 4111111111111111 exp'))
        .toBe('card [CARD] exp');
    });

    it('redacts an unformatted 15-digit (Amex-style) card number', () => {
      expect(redactPii('amex 378282246310005 on file'))
        .toBe('amex [CARD] on file');
    });
  });

  describe('other long digit runs (data-minimization catch-all)', () => {
    it('redacts an arbitrary long digit run, e.g. an account or passport number', () => {
      expect(redactPii('account 987654321012 is mine')).toBe('account [NUMBER] is mine');
    });
  });

  describe('legitimate search content is preserved', () => {
    it('keeps street addresses intact', () => {
      expect(redactPii('food near 123 Main St')).toBe('food near 123 Main St');
      expect(redactPii('shelter at 250 Joralemon Street Brooklyn'))
        .toBe('shelter at 250 Joralemon Street Brooklyn');
    });

    it('keeps zip and zip+4 codes intact', () => {
      expect(redactPii('shelter near 10001')).toBe('shelter near 10001');
      expect(redactPii('shelter near 10001-2345')).toBe('shelter near 10001-2345');
    });

    it('keeps short numbers like apartment/unit numbers intact', () => {
      expect(redactPii('apt 4567 near me')).toBe('apt 4567 near me');
    });

    it('leaves ordinary queries untouched', () => {
      expect(redactPii('shelter open tonight for women')).toBe('shelter open tonight for women');
    });
  });

  describe('multiple PII items in one query', () => {
    it('redacts every match, of every kind, in a single pass', () => {
      const query = 'shelter, call 212-555-1234 or me@example.com, ssn 123-45-6789';
      const result = redactPii(query);

      expect(result).toBe('shelter, call [PHONE] or [EMAIL], ssn [SSN]');
      expect(result).not.toContain('212-555-1234');
      expect(result).not.toContain('me@example.com');
      expect(result).not.toContain('123-45-6789');
    });
  });
});
