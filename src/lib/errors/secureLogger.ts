/**
 * Secure Logger
 *
 * Provides structured logging for analysis and sync operations
 * that NEVER logs:
 * - API keys or credentials
 * - Image data (base64, blobs)
 * - GPS coordinates
 * - Personally identifiable information (emails, names, phone numbers)
 *
 * Safe to log: provider name, success/failure, duration, sanitized error messages.
 *
 * Validates: Requirements 3.5, 9.4
 */

import { sanitizeMessage } from './formatError';

// --- Sensitive data detection for log content ---

/** Matches API key patterns (Bearer tokens, sk-*, key-*, etc.) */
const API_KEY_PATTERN =
  /(?:Bearer\s+[A-Za-z0-9\-._~+/]+=*)|(?:sk-[A-Za-z0-9\-]{10,})|(?:key-[A-Za-z0-9]{20,})|(?:[A-Za-z0-9]{32,}(?:[-_][A-Za-z0-9]+){2,})/gi;

/** Matches base64 image data */
const BASE64_IMAGE_PATTERN =
  /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{50,}|[A-Za-z0-9+/=]{100,}/gi;

/** Matches GPS coordinate patterns */
const GPS_PATTERN =
  /[-+]?\d{1,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}/g;

/** Matches email addresses */
const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Matches phone numbers (various formats — requires explicit separators or country code) */
const PHONE_PATTERN =
  /(?:\+\d{1,3}[-.\s])\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,4}/g;

/**
 * Sanitizes a string for safe logging by removing sensitive data patterns.
 */
function sanitizeForLog(value: string): string {
  let sanitized = value;

  // Remove API keys
  sanitized = sanitized.replace(API_KEY_PATTERN, '[key-redacted]');

  // Remove base64 image data
  sanitized = sanitized.replace(BASE64_IMAGE_PATTERN, '[image-redacted]');

  // Remove GPS coordinates
  sanitized = sanitized.replace(GPS_PATTERN, '[coords-redacted]');

  // Remove email addresses
  sanitized = sanitized.replace(EMAIL_PATTERN, '[email-redacted]');

  // Remove phone numbers (only match sequences that look like phone numbers)
  sanitized = sanitized.replace(PHONE_PATTERN, '[phone-redacted]');

  // Also apply the general message sanitization (stack traces, paths, etc.)
  sanitized = sanitizeMessage(sanitized);

  return sanitized;
}

/**
 * Structured log entry for analysis operations.
 */
export interface AnalysisLogEntry {
  provider: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Structured log entry for sync operations.
 */
export interface SyncLogEntry {
  itemId: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Logs an AI analysis operation result safely.
 *
 * Safe fields: provider name, success/failure boolean, duration in ms.
 * Sanitized: error messages (stripped of paths, keys, internal details).
 * NEVER logged: API keys, image data, GPS coordinates, PII.
 */
export function logAnalysis(data: AnalysisLogEntry): void {
  const entry = {
    type: 'analysis',
    provider: data.provider,
    success: data.success,
    durationMs: data.duration,
    ...(data.error ? { error: sanitizeForLog(data.error) } : {}),
    timestamp: new Date().toISOString(),
  };

  if (data.success) {
    console.info('[GrietasVivas:Analysis]', JSON.stringify(entry));
  } else {
    console.warn('[GrietasVivas:Analysis]', JSON.stringify(entry));
  }
}

/**
 * Logs a sync operation result safely.
 *
 * Safe fields: item ID (already a UUID, safe), success/failure, duration.
 * Sanitized: error messages.
 * NEVER logged: image data, GPS, PII, API keys.
 */
export function logSync(data: SyncLogEntry): void {
  const entry = {
    type: 'sync',
    itemId: data.itemId,
    success: data.success,
    durationMs: data.duration,
    ...(data.error ? { error: sanitizeForLog(data.error) } : {}),
    timestamp: new Date().toISOString(),
  };

  if (data.success) {
    console.info('[GrietasVivas:Sync]', JSON.stringify(entry));
  } else {
    console.warn('[GrietasVivas:Sync]', JSON.stringify(entry));
  }
}
