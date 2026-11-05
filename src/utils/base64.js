// joi's `.base64()` cannot be used on a large string. Its regex is
// /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/ and V8
// recurses once per repetition of that quantified group, so a multi-megabyte
// value overflows the call stack. The request then answers 500 with a stack
// trace instead of a 400, and no length bound high enough to allow a real
// photo upload is low enough to avoid it.
//
// This is the same grammar checked in linear time, with no quantified group:
// a character scan, a length multiple, and padding only at the end.

const INVALID_BASE64_CHAR = /[^A-Za-z0-9+/=]/;
const PADDING_ONLY = /^={1,2}$/;

export const isBase64 = (value) => {
  if (typeof value !== 'string' || value.length === 0) return false;
  // Padding is required, so the length is always a multiple of 4.
  if (value.length % 4 !== 0) return false;
  if (INVALID_BASE64_CHAR.test(value)) return false;

  const firstPad = value.indexOf('=');
  if (firstPad === -1) return true;
  // '=' may only be the final one or two characters.
  if (firstPad < value.length - 2) return false;
  return PADDING_ONLY.test(value.slice(firstPad));
};

export default { isBase64 };
