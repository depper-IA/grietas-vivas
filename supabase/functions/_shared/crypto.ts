/**
 * Shared utilities for Supabase Edge Functions (Deno runtime).
 *
 * Cross-runtime: the helpers below use only Web Crypto API primitives
 * or hand-rolled constant-time comparisons that also work in Node.js
 * (Vitest), so they can be unit-tested in addition to being exercised
 * by the Deno edge function.
 *
 * Validates: sdd/improve-project 1.1 — timing-safe token comparison.
 */

/**
 * Constant-time comparison of two strings.
 *
 * Uses the most appropriate primitive available in the current runtime:
 *   - Deno: `crypto.subtle.timingSafeEqual` (Deno-specific extension to Web Crypto).
 *   - Node.js (>=18): hand-rolled constant-time compare over UTF-8 bytes,
 *     since `crypto.subtle.timingSafeEqual` is NOT part of the Web Crypto spec
 *     and is unavailable in Node.
 *
 * Returns `false` immediately on length mismatch. The leak is minimal:
 * Supabase service-role keys are JWTs of fixed length, so a length mismatch
 * signals malformed input rather than a brute-force attempt.
 *
 * For equal-length inputs, runs in time proportional to the byte length
 * regardless of where the first differing byte is, mitigating timing
 * side-channel attacks on the bearer-token check.
 */
export async function timingSafeEqualString(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    return false;
  }

  // Deno: prefer the native primitive
  if (typeof (crypto.subtle as { timingSafeEqual?: unknown }).timingSafeEqual === 'function') {
    return await crypto.subtle.timingSafeEqual(
      bufA as unknown as ArrayBuffer,
      bufB as unknown as ArrayBuffer,
    );
  }

  // Node.js / any runtime without the extension: hand-rolled constant-time.
  return constantTimeEqualBytes(bufA, bufB);
}

/**
 * Hand-rolled constant-time byte comparison.
 * Always processes ALL bytes regardless of where the first difference is,
 * then OR-aggregates the per-byte difference into a single 0/non-0 result.
 */
function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length; // 0 if same length
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
