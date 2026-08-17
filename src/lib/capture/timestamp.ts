/**
 * Timestamp Module — Certified Server Timestamps
 *
 * Requests a certified server timestamp with a 5-second timeout.
 * Falls back to local device timestamp (marked as unverified)
 * when the server is unreachable or offline.
 */

import { getServerTimestampAction } from '@/app/actions/timestamp';
import type { CaptureMetadata } from './types';

type TimestampData = CaptureMetadata['timestamp'];

/** Maximum time (ms) to wait for server timestamp response. */
const SERVER_TIMEOUT_MS = 5000;

/**
 * Get a certified timestamp from the server.
 *
 * Implements a 5-second timeout using AbortController.
 * On success: returns verified server timestamp alongside local time.
 * On failure/timeout/offline: returns local timestamp marked as unverified.
 */
export async function getServerTimestamp(): Promise<TimestampData> {
  const local = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

    const result = await Promise.race([
      getServerTimestampAction(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Server timestamp request timed out'));
        });
      }),
    ]);

    clearTimeout(timeoutId);

    return {
      local,
      server: result.timestamp,
      verified: true,
    };
  } catch {
    return {
      local,
      server: null,
      verified: false,
    };
  }
}
