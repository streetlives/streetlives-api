import { ValidationError } from './errors';

export const PHONE_USE = {
  PHONE: 'phone',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  FAX: 'fax',
};

const MIN_PHONE_DIGITS = 3;
const MAX_PHONE_DIGITS = 10;
const EXTENSION_PATTERN = /(?:ext\.?|extension|x)\s*[:#-]?\s*(\d+)\s*$/i;

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function hasExtension(extension) {
  return extension !== undefined &&
    extension !== null &&
    `${extension}`.trim() !== '';
}

function splitInlineExtension(number) {
  const rawNumber = `${number || ''}`.trim();
  const extensionMatch = rawNumber.match(EXTENSION_PATTERN);

  if (!extensionMatch) {
    return {
      numberPart: rawNumber,
      extension: null,
    };
  }

  return {
    numberPart: rawNumber.slice(0, extensionMatch.index).trim(),
    extension: extensionMatch[1],
  };
}

export function normalizePhoneUse(type) {
  const normalizedType = `${type || ''}`.toLowerCase().replace(/[\s_-]+/g, '');

  if (normalizedType.includes('whatsapp')) {
    return PHONE_USE.WHATSAPP;
  }

  if (normalizedType.includes('sms') || normalizedType.includes('text')) {
    return PHONE_USE.SMS;
  }

  if (normalizedType.includes('fax')) {
    return PHONE_USE.FAX;
  }

  return PHONE_USE.PHONE;
}

export function phoneCanHaveExtension(type) {
  return normalizePhoneUse(type) === PHONE_USE.PHONE;
}

export function normalizePhoneDigits(number) {
  const digits = `${number || ''}`.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits;
}

export function validatePhoneForUse(phone) {
  const { numberPart, extension: inlineExtension } = splitInlineExtension(phone.number);
  const digits = normalizePhoneDigits(numberPart);
  const phoneUse = normalizePhoneUse(phone.type);

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    throw new ValidationError('Phone number must contain 3 to 10 digits.');
  }

  if (phoneUse === PHONE_USE.WHATSAPP && digits.length !== MAX_PHONE_DIGITS) {
    throw new ValidationError('WhatsApp numbers must contain exactly 10 digits.');
  }

  if (
    !phoneCanHaveExtension(phone.type) &&
    (hasExtension(phone.extension) || hasExtension(inlineExtension))
  ) {
    throw new ValidationError('SMS, WhatsApp, and fax numbers cannot have extensions.');
  }
}

export function normalizePhoneParams(params, fallbackType) {
  const normalizedParams = { ...params };
  const type = hasOwn(normalizedParams, 'type') ? normalizedParams.type : fallbackType;
  const canHaveExtension = phoneCanHaveExtension(type);

  if (hasOwn(normalizedParams, 'number')) {
    const {
      numberPart,
      extension: inlineExtension,
    } = splitInlineExtension(normalizedParams.number);

    normalizedParams.number = normalizePhoneDigits(numberPart);

    if (
      canHaveExtension &&
      !hasExtension(normalizedParams.extension) &&
      hasExtension(inlineExtension)
    ) {
      normalizedParams.extension = parseInt(inlineExtension, 10);
    }
  }

  if (
    hasOwn(normalizedParams, 'extension') &&
    hasExtension(normalizedParams.extension)
  ) {
    normalizedParams.extension = parseInt(normalizedParams.extension, 10);
  }

  return normalizedParams;
}
