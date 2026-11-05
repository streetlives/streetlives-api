// Magic-byte image detection. Deliberately dependency-free: the Lambda zip
// cannot carry a native build, so `sharp` and friends are not an option, and
// all we need is the real type plus the pixel dimensions.
//
// This is a security control, not a convenience. The bytes end up on a public
// CDN under whatever content type we record, so the declared type has to be
// checked against what was actually uploaded - otherwise an `image/png` label
// on an SVG or an HTML document becomes stored XSS on the CDN domain.

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

const detectJpeg = (buffer) => {
  if (buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) return null;

  // Walk the segment chain looking for a start-of-frame, which carries the
  // dimensions. Anything malformed just yields no dimensions rather than
  // rejecting the image - it is still a JPEG.
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break;

    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue; // eslint-disable-line no-continue
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;

    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        contentType: 'image/jpeg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return { contentType: 'image/jpeg', width: null, height: null };
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const detectPng = (buffer) => {
  if (buffer.length < 24) return null;
  if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.slice(12, 16).toString('latin1') !== 'IHDR') return null;

  return {
    contentType: 'image/png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

// WebP packs its dimensions into bit fields, so this block needs the bitwise
// operators airbnb bans. Parsing a binary header is the case the rule does
// not serve; the alternative is arithmetic that reads far worse.
/* eslint-disable no-bitwise */
const detectWebp = (buffer) => {
  if (buffer.length < 30) return null;
  if (buffer.slice(0, 4).toString('latin1') !== 'RIFF') return null;
  if (buffer.slice(8, 12).toString('latin1') !== 'WEBP') return null;

  const chunk = buffer.slice(12, 16).toString('latin1');

  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte frame tag, then the 3-byte sync code 0x9d012a.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return { contentType: 'image/webp', width: null, height: null };
    }
    return {
      contentType: 'image/webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) {
      return { contentType: 'image/webp', width: null, height: null };
    }
    const bits = buffer.readUInt32LE(21);
    return {
      contentType: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === 'VP8X') {
    // 24-bit little-endian, stored as (dimension - 1).
    const width = buffer[24] | (buffer[25] << 8) | (buffer[26] << 16);
    const height = buffer[27] | (buffer[28] << 8) | (buffer[29] << 16);
    return { contentType: 'image/webp', width: width + 1, height: height + 1 };
  }

  return { contentType: 'image/webp', width: null, height: null };
};

/* eslint-enable no-bitwise */

/**
 * Returns { contentType, width, height } for a supported raster image, or null
 * for anything we do not accept - including SVG, GIF, PDF and truncated data.
 */
export const detectImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  return detectJpeg(buffer) || detectPng(buffer) || detectWebp(buffer);
};

export default { detectImage };
