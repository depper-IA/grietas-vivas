/**
 * Type declarations for piexifjs (v1.0.6)
 *
 * piexifjs does not ship its own type definitions.
 * Only the `remove` function is declared here since that's
 * all we use for EXIF stripping.
 */
declare module 'piexifjs' {
  /** Removes all EXIF data from a JPEG binary string or base64 data URL. */
  function remove(jpeg: string): string;

  /** Loads EXIF data from a JPEG binary string or base64 data URL. */
  function load(jpeg: string): Record<string, Record<number, unknown>>;

  /** Dumps EXIF data object to binary string. */
  function dump(exifObj: Record<string, Record<number, unknown>>): string;

  /** Inserts EXIF binary into a JPEG binary string or base64 data URL. */
  function insert(exifBytes: string, jpeg: string): string;

  const version: string;

  const piexif: { remove: typeof remove; load: typeof load; dump: typeof dump; insert: typeof insert; version: string };

  export { remove, load, dump, insert, version };
  export default piexif;
}
