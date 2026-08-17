/**
 * Conflict Resolver — Sync Conflict Detection and Preservation
 *
 * Detects when server-side data is newer than local data and preserves
 * both versions without any data loss. The local version remains in
 * IndexedDB; the server version is stored in the `conflictData` field.
 *
 * Validates: Requirements 12.5
 */

import type { SyncQueueItem } from './types';

/**
 * Shape of server data that includes a timestamp for conflict comparison.
 * Any object with an `updated_at` ISO string qualifies.
 */
export interface ServerDataWithTimestamp {
  updated_at: string;
  [key: string]: unknown;
}

/**
 * Type guard: checks if the provided data has a valid `updated_at` field.
 */
function hasUpdatedAt(data: unknown): data is ServerDataWithTimestamp {
  return (
    typeof data === 'object' &&
    data !== null &&
    'updated_at' in data &&
    typeof (data as Record<string, unknown>).updated_at === 'string'
  );
}

/**
 * Detect whether server data conflicts with the local item.
 *
 * A conflict exists when the server's `updated_at` timestamp is strictly
 * newer than the local item's `lastAttempt` (or `createdAt` if never attempted).
 *
 * @param localItem  The local sync queue item
 * @param serverData The data returned from the server
 * @returns true if a conflict is detected (server is newer)
 */
export function detectConflict(
  localItem: SyncQueueItem,
  serverData: unknown,
): boolean {
  if (!hasUpdatedAt(serverData)) {
    // Cannot determine conflict without a server timestamp — no conflict assumed
    return false;
  }

  const localTimestamp = localItem.lastAttempt ?? localItem.createdAt;
  const serverTime = new Date(serverData.updated_at).getTime();
  const localTime = new Date(localTimestamp).getTime();

  // If either timestamp is invalid, cannot determine conflict
  if (isNaN(serverTime) || isNaN(localTime)) {
    return false;
  }

  return serverTime > localTime;
}

/**
 * Preserve both local and server versions of a conflicting item.
 *
 * The local version (captureResult, metadata) stays intact in the queue item.
 * The server version is stored in `conflictData` so no data is lost.
 * The item is marked with status 'conflict'.
 *
 * @param localItem  The local sync queue item
 * @param serverData The conflicting server-side data
 * @returns A new SyncQueueItem with conflict status and both versions preserved
 */
export function preserveConflict(
  localItem: SyncQueueItem,
  serverData: unknown,
): SyncQueueItem {
  return {
    ...localItem,
    status: 'conflict',
    conflictData: serverData,
    lastAttempt: new Date().toISOString(),
    error: 'Sync conflict: server data is newer than local version',
  };
}
