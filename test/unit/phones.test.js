import {
  normalizePhoneParams,
  normalizePhoneUse,
  phoneCanHaveExtension,
  validatePhoneForUse,
} from '../../src/utils/phones';

describe('phone utilities', () => {
  it('normalizes punctuation and a leading US country code', () => {
    expect(normalizePhoneParams({
      number: '+1 (212) 555-1212',
      extension: null,
      type: 'Main Office',
    })).toMatchObject({
      number: '2125551212',
      extension: null,
    });
  });

  it('allows short phone and SMS numbers', () => {
    expect(() => validatePhoneForUse({ number: '988', type: 'Hotline' }))
      .not.toThrow();
    expect(() => validatePhoneForUse({ number: '12345', type: 'Text only' }))
      .not.toThrow();
  });

  it('requires WhatsApp numbers to be full ten digit numbers', () => {
    expect(() => validatePhoneForUse({ number: '12345', type: 'WhatsApp' }))
      .toThrow('WhatsApp numbers must contain exactly 10 digits.');
  });

  it('blocks extensions on SMS, WhatsApp, and fax numbers', () => {
    expect(() => validatePhoneForUse({
      number: '2125551212',
      extension: 123,
      type: 'SMS',
    })).toThrow('SMS, WhatsApp, and fax numbers cannot have extensions.');

    expect(() => validatePhoneForUse({
      number: '2125551212 x123',
      type: 'Fax',
    })).toThrow('SMS, WhatsApp, and fax numbers cannot have extensions.');
  });

  it('parses inline extensions for regular phone numbers', () => {
    expect(normalizePhoneParams({
      number: '(212) 555-1212 x123',
      type: 'Main Office',
    })).toMatchObject({
      number: '2125551212',
      extension: 123,
    });
  });

  it('detects extensionless phone uses from free-form type text', () => {
    expect(normalizePhoneUse('Text only')).toBe('sms');
    expect(normalizePhoneUse('WhatsApp')).toBe('whatsapp');
    expect(normalizePhoneUse('Fax')).toBe('fax');
    expect(phoneCanHaveExtension('Text only')).toBe(false);
  });
});
