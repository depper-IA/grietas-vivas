/**
 * Safe Error Formatting
 *
 * Transforms internal errors into SafeErrorResponse objects that NEVER expose:
 * - Stack traces
 * - Server file paths
 * - Database identifiers (UUIDs in error context)
 * - Internal service names (supabase, postgres, internal endpoints)
 *
 * Validates: Requirements 3.5, 9.4
 */

import type { SafeErrorResponse } from './types';

// --- Sensitive pattern detection ---

/** Matches Unix/Windows file paths */
const FILE_PATH_PATTERN =
  /(?:\/(?:src|var|usr|home|tmp|etc|app|lib|node_modules)\/[^\s,;'"]+)|(?:[A-Z]:\\[^\s,;'"]+)/gi;

/** Matches stack trace lines (e.g., "at Function.Module..." or source map refs) */
const STACK_TRACE_PATTERN =
  /\s*at\s+[\w.<>]+\s*\(.*\)|\s*at\s+(?:\/|[A-Z]:\\).*:\d+:\d+|\.ts:\d+:\d+|\.js:\d+:\d+/gi;

/** Matches UUIDs that may leak database identifiers */
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Matches internal service names that should not be exposed */
const SERVICE_NAME_PATTERN =
  /\b(?:supabase|postgres(?:ql)?|pg_|redis|internal[-_]?api|edge[-_]?function|service[-_]?role|anon[-_]?key|next[-_]?auth|prisma)\b/gi;

/**
 * Strips all sensitive patterns from a message string.
 * Returns a sanitized version safe for user-facing responses.
 */
export function sanitizeMessage(message: string): string {
  let sanitized = message;

  // Remove stack traces first (multi-line patterns)
  sanitized = sanitized.replace(STACK_TRACE_PATTERN, '[redacted]');

  // Remove file paths
  sanitized = sanitized.replace(FILE_PATH_PATTERN, '[redacted]');

  // Remove UUIDs (database identifiers)
  sanitized = sanitized.replace(UUID_PATTERN, '[id]');

  // Remove internal service names
  sanitized = sanitized.replace(SERVICE_NAME_PATTERN, '[service]');

  // Collapse multiple [redacted] tokens into one
  sanitized = sanitized.replace(/(\[redacted\]\s*){2,}/g, '[redacted] ');

  // Trim trailing/leading whitespace and collapse internal whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

// --- Known error type mapping ---

interface KnownError {
  code: string;
  message: string;
}

/**
 * Checks if an error is a Zod validation error (has `issues` array).
 */
function isZodError(error: unknown): error is { issues: Array<{ path: (string | number)[]; message: string }> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

/**
 * Detects known error types and maps them to safe codes + messages.
 */
function mapKnownError(error: unknown): KnownError | null {
  if (isZodError(error)) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'One or more fields are invalid.',
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Authentication errors
    if (
      msg.includes('unauthorized') ||
      msg.includes('not authenticated') ||
      msg.includes('invalid token') ||
      msg.includes('jwt') ||
      msg.includes('auth')
    ) {
      return {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required to access this resource.',
      };
    }

    // Forbidden / access denied
    if (msg.includes('forbidden') || msg.includes('access denied') || msg.includes('permission')) {
      return {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      };
    }

    // Not found
    if (msg.includes('not found') || msg.includes('does not exist')) {
      return {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      };
    }

    // Rate limiting
    if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
      return {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      };
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
      return {
        code: 'TIMEOUT',
        message: 'The request took too long to complete. Please try again.',
      };
    }

    // Upload / storage
    if (msg.includes('upload') || msg.includes('storage')) {
      return {
        code: 'UPLOAD_FAILED',
        message: 'File upload failed. Please try again.',
      };
    }

    // Network errors
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'A network error occurred. Please check your connection.',
      };
    }
  }

  return null;
}

/**
 * Extracts field-level errors from Zod validation errors.
 */
function extractFieldErrors(error: unknown): Record<string, string> | undefined {
  if (!isZodError(error)) return undefined;

  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const fieldPath = issue.path.join('.');
    if (fieldPath) {
      fields[fieldPath] = sanitizeMessage(issue.message);
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Transforms any internal error into a SafeErrorResponse.
 *
 * - Maps known error types to specific error codes
 * - Strips stack traces, file paths, DB IDs, and service names
 * - For unknown errors, returns a generic message
 *
 * @param error - Any thrown error (Error, ZodError, string, unknown)
 * @returns SafeErrorResponse safe for client consumption
 */
export function formatError(error: unknown): SafeErrorResponse {
  // Try to map to a known error type first
  const known = mapKnownError(error);

  if (known) {
    return {
      error: {
        code: known.code,
        message: known.message,
        fields: extractFieldErrors(error),
      },
    };
  }

  // For unknown errors, return a generic safe message
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  };
}
