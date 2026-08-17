/**
 * EXIF Metadata Stripping Module
 *
 * Strips all EXIF metadata from images before they are sent to external AI
 * providers, preventing leakage of device or location information.
 *
 * @see Requirements 10.5 — Strip EXIF metadata from images before sending to external AI providers
 */

// piexifjs has no type declarations — use default import (CJS interop)
import piexif from 'piexifjs';

/** JPEG magic bytes signature */
const JPEG_SIGNATURES = {
  /** Standard JPEG SOI marker (Start of Image) */
  binaryPrefix: '\xff\xd8',
  /** Base64 data URL prefixes */
  dataUrlPrefixes: ['data:image/jpeg;base64,', 'data:image/jpg;base64,'],
} as const;

/**
 * Converts a Blob to a binary string for piexifjs processing.
 * Uses FileReader-compatible approach for broad environment support.
 */
async function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      resolve(binaryString);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Converts a binary string back to a Blob.
 */
function binaryStringToBlob(binaryString: string, mimeType: string): Blob {
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Checks if a binary string represents a JPEG image.
 */
function isJpegBinaryString(data: string): boolean {
  return data.slice(0, 2) === JPEG_SIGNATURES.binaryPrefix;
}

/**
 * Checks if a Blob is a JPEG image based on its MIME type.
 */
function isJpegBlob(blob: Blob): boolean {
  return blob.type === 'image/jpeg' || blob.type === 'image/jpg';
}

/**
 * Strips all EXIF metadata from a JPEG image Blob.
 *
 * - For JPEG images: removes all EXIF data segments and returns a clean Blob.
 * - For non-JPEG images: rejects with an error per security requirements
 *   (we cannot guarantee EXIF-like metadata is stripped from other formats).
 *
 * @param imageBlob - The image Blob to process
 * @returns A new Blob with all EXIF metadata removed
 * @throws Error if the image cannot be processed or is not JPEG
 *
 * @example
 * ```ts
 * const cleanImage = await stripExifData(capturedPhoto);
 * // cleanImage has no EXIF GPS, device info, or timestamps
 * ```
 */
export async function stripExifData(imageBlob: Blob): Promise<Blob> {
  // Non-JPEG images cannot be reliably stripped of metadata by piexifjs.
  // Per security requirements (10.5), we reject rather than pass through
  // to prevent potential metadata leakage from unknown formats.
  if (!isJpegBlob(imageBlob)) {
    throw new ExifStripError(
      'UNSUPPORTED_FORMAT',
      'Only JPEG images are supported for EXIF stripping. Non-JPEG formats cannot be reliably processed.'
    );
  }

  try {
    const binaryString = await blobToBinaryString(imageBlob);

    // Verify the binary content is actually JPEG
    if (!isJpegBinaryString(binaryString)) {
      throw new ExifStripError(
        'INVALID_JPEG',
        'Image content does not match JPEG format despite MIME type declaration.'
      );
    }

    // Use piexifjs to remove all EXIF data segments
    const strippedBinaryString: string = piexif.remove(binaryString);

    return binaryStringToBlob(strippedBinaryString, 'image/jpeg');
  } catch (error) {
    // Re-throw our own errors
    if (error instanceof ExifStripError) {
      throw error;
    }

    // Wrap unexpected errors — reject rather than pass through per security requirements
    throw new ExifStripError(
      'STRIP_FAILED',
      'Failed to strip EXIF metadata from image. The image will not be sent to prevent potential data leakage.'
    );
  }
}

/**
 * Custom error class for EXIF stripping failures.
 */
export class ExifStripError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ExifStripError';
    this.code = code;
  }
}
