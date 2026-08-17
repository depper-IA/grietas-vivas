/**
 * Unit tests for EXIF metadata stripping module.
 *
 * Validates: Requirement 10.5 — Strip EXIF metadata from images before
 * sending them to external AI providers.
 */
import { describe, it, expect } from 'vitest';
import { stripExifData, ExifStripError } from './strip';

/** Helper: Read a Blob as a binary string (jsdom-compatible). */
function blobToString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      resolve(str);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Creates a minimal valid JPEG blob with SOS segment (required by piexifjs).
 * piexifjs's splitIntoSegments requires at least SOI + SOS to function.
 */
function createMinimalJpegBlob(): Blob {
  // SOI (FF D8) + SOS marker (FF DA) + minimal SOS header (length=2+minimal) + image data + EOI
  // piexifjs stops segment parsing at SOS and captures everything after as the last segment
  const data = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xda, // SOS marker — piexifjs captures rest as final segment
    0x00, 0x02, // SOS length (just the 2 length bytes, minimal)
    0x00,       // minimal scan data
    0xff, 0xd9, // EOI
  ]);
  return new Blob([data], { type: 'image/jpeg' });
}

/**
 * Creates a JPEG blob that contains an EXIF APP1 segment.
 * Structure: SOI + APP1 (EXIF) + SOS + data + EOI
 * piexifjs requires SOS (FF DA) to terminate segment parsing.
 */
function createJpegWithExif(): Blob {
  const bytes = new Uint8Array([
    // SOI
    0xff, 0xd8,
    // APP1 marker (EXIF)
    0xff, 0xe1,
    // Length of EXIF segment (big-endian): 6 (Exif\0\0) + 10 (dummy) + 2 (length field) = 18
    0x00, 0x12,
    // EXIF identifier: "Exif\0\0"
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    // Dummy EXIF data (TIFF header placeholder)
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00,
    // SOS marker — piexifjs needs this to terminate segment parsing
    0xff, 0xda,
    0x00, 0x02, // SOS length (minimal)
    0x00,       // minimal scan data
    // EOI
    0xff, 0xd9,
  ]);

  return new Blob([bytes], { type: 'image/jpeg' });
}

describe('stripExifData', () => {
  it('should strip EXIF data from a JPEG image', async () => {
    const jpegWithExif = createJpegWithExif();
    const result = await stripExifData(jpegWithExif);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');

    // The result should be smaller than the input (EXIF removed)
    expect(result.size).toBeLessThan(jpegWithExif.size);

    // Verify the output is still a valid JPEG (starts with SOI) and has no EXIF
    const binaryStr = await blobToString(result);
    expect(binaryStr.charCodeAt(0)).toBe(0xff);
    expect(binaryStr.charCodeAt(1)).toBe(0xd8);

    // Verify no EXIF APP1 segment remains
    const hasExif = binaryStr.includes('Exif\x00\x00');
    expect(hasExif).toBe(false);
  });

  it('should pass through a JPEG without EXIF unchanged', async () => {
    const cleanJpeg = createMinimalJpegBlob();
    const result = await stripExifData(cleanJpeg);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
    // Size should be the same since no EXIF to strip
    expect(result.size).toBe(cleanJpeg.size);
  });

  it('should reject non-JPEG images with UNSUPPORTED_FORMAT error', async () => {
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: 'image/png',
    });

    await expect(stripExifData(pngBlob)).rejects.toThrow(ExifStripError);
    await expect(stripExifData(pngBlob)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });

  it('should reject a blob with JPEG mime but invalid binary content', async () => {
    // Blob claims to be JPEG but content is not
    const fakeJpeg = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], {
      type: 'image/jpeg',
    });

    await expect(stripExifData(fakeJpeg)).rejects.toThrow(ExifStripError);
    await expect(stripExifData(fakeJpeg)).rejects.toMatchObject({
      code: 'INVALID_JPEG',
    });
  });

  it('should reject WebP images', async () => {
    const webpBlob = new Blob([new Uint8Array(10)], { type: 'image/webp' });
    await expect(stripExifData(webpBlob)).rejects.toThrow(ExifStripError);
    await expect(stripExifData(webpBlob)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });
});
