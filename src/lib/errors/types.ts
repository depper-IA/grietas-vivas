/**
 * Error Handling — Core Type Definitions
 *
 * Structured error responses that never expose internal system details
 * (stack traces, file paths, database identifiers, or internal service names).
 */

/** Structured error response returned to clients on validation or processing failures. */
export interface SafeErrorResponse {
  error: {
    /** Machine-readable error code */
    code: string;
    /** Human-readable error message without internal details */
    message: string;
    /** Field-level validation errors, if applicable */
    fields?: Record<string, string>;
  };
}
