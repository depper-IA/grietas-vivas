/**
 * Sanitization Utilities — Pure functions for input sanitization.
 *
 * These utilities operate independently of Zod and can be used
 * anywhere input needs to be cleaned before processing.
 */

/**
 * Sanitize a file name by stripping all characters except [a-zA-Z0-9\-_.].
 * Enforces a maximum length of 255 characters.
 *
 * @param name - Raw file name input
 * @returns Sanitized file name containing only safe characters
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '').slice(0, 255);
}

/**
 * Truncate a metadata string value to a maximum length.
 *
 * @param value - The metadata string to truncate
 * @param maxLength - Maximum allowed length (default: 1024)
 * @returns Truncated string
 */
export function truncateMetadata(value: string, maxLength: number = 1024): string {
  return value.slice(0, maxLength);
}

/**
 * Check whether a file name is valid after sanitization.
 * Returns false if the sanitized result would be empty.
 *
 * @param name - Raw file name to validate
 * @returns true if the sanitized name is non-empty, false otherwise
 */
export function isValidSanitizedFileName(name: string): boolean {
  return sanitizeFileName(name).length > 0;
}
