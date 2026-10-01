/**
 * @jest-environment node
 */

// Tests for isBase64 in src/utils/base64.js, which exists because joi's
// .base64() overflows the call stack on a multi-megabyte value. The point of
// these is that it accepts exactly what Node's own encoder produces, rejects
// what joi's regex would reject, and does neither by recursing.

const { isBase64 } = require('../../src/utils/base64');

// joi's regex, for comparison. Safe to run here only because these fixtures are
// small; that it cannot be run on a real upload is the whole reason for the
// module under test.
const JOI_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

describe('isBase64', () => {
  describe('agrees with Node\'s encoder', () => {
    // Covers all three padding cases: n % 3 of 1, 2 and 0.
    it.each([1, 2, 3, 4, 5, 6, 100, 1023, 1024, 65536])(
      'accepts base64 of %i bytes',
      (bytes) => {
        const encoded = Buffer.alloc(bytes, 0x41).toString('base64');
        expect(isBase64(encoded)).toBe(true);
      },
    );

    it('accepts base64 containing + and /', () => {
      // 0xFB 0xFF encodes to characters from both ends of the alphabet.
      const encoded = Buffer.from([0xfb, 0xff, 0xbf, 0xfb, 0xef, 0xbe]).toString('base64');
      expect(encoded).toMatch(/[+/]/);
      expect(isBase64(encoded)).toBe(true);
    });
  });

  describe('rejects what is not base64', () => {
    it.each([
      ['an empty string', ''],
      ['a length that is not a multiple of four', 'YWJ'],
      ['characters outside the alphabet', 'YWJj!A=='],
      ['a space', 'YWJj YWJj'],
      ['a newline, which joi also rejects', 'YWJj\nYWJj'],
      ['padding in the middle', 'YW==YWJj'],
      ['three padding characters', 'YQ==='],
      ['padding only', '===='],
      ['a data-URL prefix', 'data:image/jpeg;base64,YWJj'],
    ])('rejects %s', (_label, value) => {
      expect(isBase64(value)).toBe(false);
    });

    it.each([
      ['a number', 12345],
      ['null', null],
      ['undefined', undefined],
      ['an object', {}],
    ])('rejects %s', (_label, value) => {
      expect(isBase64(value)).toBe(false);
    });
  });

  // If these two ever disagree, the replacement has changed meaning rather than
  // just changed implementation.
  describe('matches joi\'s grammar on small inputs', () => {
    const samples = [
      Buffer.alloc(1, 0x41).toString('base64'),
      Buffer.alloc(2, 0x41).toString('base64'),
      Buffer.alloc(3, 0x41).toString('base64'),
      Buffer.alloc(64, 0x41).toString('base64'),
      '', 'YWJ', 'YWJj!A==', 'YW==YWJj', 'YQ===', '====', 'YWJj\nYWJj',
    ];

    it.each(samples)('agrees on %p', (value) => {
      expect(isBase64(value)).toBe(JOI_BASE64.test(value) && value.length > 0);
    });
  });

  // The reason this module exists: joi's regex cannot survive this input.
  describe('survives a real upload-sized value', () => {
    const encoded = Buffer.alloc(4 * 1024 * 1024, 0x41).toString('base64');

    it('accepts 4MiB of base64 without overflowing', () => {
      expect(encoded.length).toBeGreaterThan(5 * 1000 * 1000);
      expect(isBase64(encoded)).toBe(true);
    });

    it('rejects the same length with one bad character, without overflowing', () => {
      const corrupted = `${encoded.slice(0, -5)}!${encoded.slice(-4)}`;
      expect(isBase64(corrupted)).toBe(false);
    });

    it('confirms joi would have thrown on it', () => {
      expect(() => JOI_BASE64.test(encoded)).toThrow(RangeError);
    });
  });
});
