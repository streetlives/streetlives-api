/**
 * @jest-environment node
 */

// Tests for detectImage in src/utils/image.js. This is a security control, not
// a convenience: the bytes reach a public CDN under whatever content type we
// record, so a mislabelled SVG or HTML document would be stored XSS on the CDN
// domain. Everything not on the allowlist has to come back null.

const zlib = require('zlib');
const { detectImage } = require('../../src/utils/image');

const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // detectImage reads the header, it does not verify checksums, so a zeroed
  // CRC keeps these fixtures readable without changing what is under test.
  return Buffer.concat([length, body, Buffer.alloc(4)]);
};

const buildPng = (width, height) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.alloc((width * height * 3) + height))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const buildJpeg = (width, height) => {
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(9, 0); // segment length
  sof[2] = 8; // precision
  sof.writeUInt16BE(height, 3);
  sof.writeUInt16BE(width, 5);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0]), Buffer.from([0x00, 0x04, 0x00, 0x00]), // APP0
    Buffer.from([0xff, 0xc0]), sof, // SOF0
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
};

const buildWebp = (fourcc, payload) => {
  const chunk = Buffer.concat([Buffer.from(fourcc, 'latin1'), Buffer.alloc(4), payload]);
  chunk.writeUInt32LE(payload.length, 4);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk]);
  const out = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), body]);
  out.writeUInt32LE(body.length, 4);
  return out;
};

describe('detectImage', () => {
  describe('accepted formats', () => {
    it('detects a PNG and its dimensions', () => {
      expect(detectImage(buildPng(1600, 1200)))
        .toEqual({ contentType: 'image/png', width: 1600, height: 1200 });
    });

    it('detects a JPEG and its dimensions from the SOF0 marker', () => {
      expect(detectImage(buildJpeg(640, 480)))
        .toEqual({ contentType: 'image/jpeg', width: 640, height: 480 });
    });

    it('detects a lossy VP8 WebP', () => {
      const payload = Buffer.alloc(20);
      Buffer.from([0x9d, 0x01, 0x2a]).copy(payload, 3);
      payload.writeUInt16LE(800, 6);
      payload.writeUInt16LE(600, 8);
      expect(detectImage(buildWebp('VP8 ', payload)))
        .toEqual({ contentType: 'image/webp', width: 800, height: 600 });
    });

    it('detects a lossless VP8L WebP', () => {
      const payload = Buffer.alloc(20);
      payload[0] = 0x2f;
      /* eslint-disable no-bitwise */
      payload.writeUInt32LE(((600 - 1) << 14) | (800 - 1), 1);
      /* eslint-enable no-bitwise */
      expect(detectImage(buildWebp('VP8L', payload)))
        .toEqual({ contentType: 'image/webp', width: 800, height: 600 });
    });

    it('detects an extended VP8X WebP', () => {
      const payload = Buffer.alloc(10);
      payload.writeUIntLE(800 - 1, 4, 3);
      payload.writeUIntLE(600 - 1, 7, 3);
      expect(detectImage(buildWebp('VP8X', payload)))
        .toEqual({ contentType: 'image/webp', width: 800, height: 600 });
    });

    it('still reports the type when a JPEG carries no start-of-frame', () => {
      const headerOnly = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.from([0x00, 0x04, 0x00, 0x00]),
      ]);
      expect(detectImage(headerOnly))
        .toEqual({ contentType: 'image/jpeg', width: null, height: null });
    });
  });

  describe('rejected data', () => {
    it.each([
      ['an SVG document', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
      ['an HTML document', Buffer.from('<!doctype html><html><body>hi</body></html>')],
      ['a PDF', Buffer.from(`%PDF-1.7\n${'x'.repeat(64)}`)],
      ['a GIF', Buffer.concat([Buffer.from('GIF87a'), Buffer.alloc(64)])],
      ['a RIFF container that is not WebP', Buffer.concat([
        Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(40),
      ])],
      ['a truncated PNG signature', Buffer.from([0x89, 0x50, 0x4e])],
      ['a PNG signature with no IHDR', Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32),
      ])],
      ['an empty buffer', Buffer.alloc(0)],
      ['plain text', Buffer.from('just some text')],
    ])('rejects %s', (_label, buffer) => {
      expect(detectImage(buffer)).toBeNull();
    });

    it('rejects a non-buffer', () => {
      expect(detectImage('not a buffer')).toBeNull();
      expect(detectImage(null)).toBeNull();
      expect(detectImage(undefined)).toBeNull();
    });
  });

  describe('type confusion', () => {
    it('reports JPEG for JPEG bytes regardless of what a caller declared', () => {
      // The controller compares this against the declared contentType; the
      // mismatch is what stops an image/png label on non-PNG bytes.
      expect(detectImage(buildJpeg(10, 10)).contentType).toBe('image/jpeg');
    });
  });
});
