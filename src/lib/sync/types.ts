/**
 * Offline-First Sync Manager — Core Type Definitions
 *
 * Types for managing the synchronization queue between
 * IndexedDB (local cache) and Supabase (remote persistence).
 */

import type { CaptureResult } from '@/lib/capture/types';

/** Status of a sync queue item. */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

/** An item in the synchronization queue. */
export interface SyncQueueItem {
  /** Unique identifier for this queue entry */
  id: string;
  /** The capture result awaiting synchronization */
  captureResult: CaptureResult;
  /** Current sync status */
  status: SyncStatus;
  /** Number of retry attempts made */
  retryCount: number;
  /** ISO 8601 timestamp of last sync attempt, null if never attempted */
  lastAttempt: string | null;
  /** Error message from last failed attempt, null if no error */
  error: string | null;
  /** ISO 8601 timestamp when item was enqueued */
  createdAt: string;
  /** Server-side version preserved on conflict (Req 12.5) — both versions kept without data loss */
  conflictData?: unknown;
}

/** Aggregate status of the synchronization queue. */
export interface QueueStatus {
  /** Number of items waiting to sync */
  pending: number;
  /** Number of items currently syncing */
  syncing: number;
  /** Number of items that failed to sync */
  failed: number;
  /** Number of items in conflict (server data newer than local) */
  conflicts: number;
  /** Total items in queue */
  total: number;
  /** True if total >= 50 (max local cache capacity) */
  isFull: boolean;
}

/** Result of a single sync operation. */
export interface SyncResult {
  /** ID of the synced item */
  id: string;
  /** Whether the sync succeeded */
  success: boolean;
  /** Error message if sync failed */
  error?: string;
}

/** Interface for the synchronization queue manager. */
export interface ISyncManager {
  /** Add a capture to the sync queue. */
  enqueue(capture: CaptureResult): Promise<void>;
  /** Process all pending items in the queue. */
  processQueue(): Promise<SyncResult[]>;
  /** Get aggregate status of the queue. */
  getQueueStatus(): Promise<QueueStatus>;
  /** Get total number of items in the queue. */
  getQueueCount(): Promise<number>;
  /** Remove an item from the queue by ID. */
  removeItem(id: string): Promise<void>;
  /** Retry all failed items. */
  retryFailed(): Promise<void>;
}
