/**
 * Sync Manager — Offline-First Synchronization Orchestrator
 *
 * Implements ISyncManager for managing the upload queue with:
 * - Chronological processing (oldest first)
 * - Exponential backoff retries (1s, 2s, 4s) up to 3 attempts
 * - 30-second timeout per item
 * - Failed item retention for retry on connectivity restoration
 *
 * Validates: Requirements 1.4, 1.5, 4.6, 12.3, 12.7
 */

import type { CaptureResult } from '@/lib/capture/types';
import type { ISyncManager, SyncQueueItem, SyncResult, QueueStatus } from './types';
import {
  addToQueue,
  getItemsByStatus,
  updateQueueItem,
  removeFromQueue,
  getQueueStatusCounts,
  getQueueCount as queueCount,
} from './queue';
import { detectConflict, preserveConflict } from './conflictResolver';
import { logSync } from '@/lib/errors/secureLogger';

/** Maximum retry attempts before marking an item as failed. */
export const MAX_RETRIES = 3;

/** Timeout in milliseconds for a single sync attempt. */
export const SYNC_TIMEOUT_MS = 30_000;

/** Base delay in ms for exponential backoff (1s, 2s, 4s). */
export const BASE_BACKOFF_MS = 1_000;

/**
 * Calculate exponential backoff delay for a given retry count.
 * Retry 0 → 1s, Retry 1 → 2s, Retry 2 → 4s.
 */
export function calculateBackoff(retryCount: number): number {
  return BASE_BACKOFF_MS * Math.pow(2, retryCount);
}

/**
 * Default sync function placeholder — should be replaced via `createSyncManager`.
 * In production, this calls the server action to upload to Supabase.
 */
export type SyncFunction = (item: SyncQueueItem) => Promise<void>;

/** Delay function signature — injectable for testing. */
export type DelayFunction = (ms: number) => Promise<void>;

/** Configuration for the SyncManager. */
export interface SyncManagerOptions {
  /** The function that performs the actual sync (upload to backend). */
  syncFn: SyncFunction;
  /** Optional delay function — defaults to real setTimeout. Inject for testing. */
  delayFn?: DelayFunction;
}

/**
 * Create a SyncManager instance with an injected sync function.
 * This allows the actual upload logic to be swapped for testing.
 */
export function createSyncManager(options: SyncManagerOptions | SyncFunction): ISyncManager {
  if (typeof options === 'function') {
    return new SyncManager({ syncFn: options });
  }
  return new SyncManager(options);
}

class SyncManager implements ISyncManager {
  private syncFn: SyncFunction;
  private delayFn: DelayFunction;

  constructor(options: SyncManagerOptions) {
    this.syncFn = options.syncFn;
    this.delayFn = options.delayFn ?? sleep;
  }

  /**
   * Add a capture to the sync queue.
   * Rejects if queue is at capacity (50 items).
   */
  async enqueue(capture: CaptureResult): Promise<void> {
    const item: SyncQueueItem = {
      id: capture.id,
      captureResult: capture,
      status: 'pending',
      retryCount: 0,
      lastAttempt: null,
      error: null,
      createdAt: capture.createdAt,
    };

    await addToQueue(item);
  }

  /**
   * Process all pending items in chronological order (oldest first).
   * Applies exponential backoff between retries and enforces 30s timeout.
   */
  async processQueue(): Promise<SyncResult[]> {
    const pendingItems = await getItemsByStatus('pending');
    const results: SyncResult[] = [];

    for (const item of pendingItems) {
      const result = await this.processItem(item);
      results.push(result);
    }

    return results;
  }

  /**
   * Get aggregate status of the queue.
   */
  async getQueueStatus(): Promise<QueueStatus> {
    return getQueueStatusCounts();
  }

  /**
   * Get total number of items in the queue.
   */
  async getQueueCount(): Promise<number> {
    return queueCount();
  }

  /**
   * Remove an item from the queue by ID.
   */
  async removeItem(id: string): Promise<void> {
    await removeFromQueue(id);
  }

  /**
   * Retry all failed items by resetting their status to 'pending'.
   * Called on connectivity restoration (Req 12.7).
   */
  async retryFailed(): Promise<void> {
    const failedItems = await getItemsByStatus('failed');

    for (const item of failedItems) {
      const updated: SyncQueueItem = {
        ...item,
        status: 'pending',
        error: null,
      };
      await updateQueueItem(updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Process a single queue item with timeout and retry logic.
   */
  private async processItem(item: SyncQueueItem): Promise<SyncResult> {
    // Mark as syncing
    const syncingItem: SyncQueueItem = {
      ...item,
      status: 'syncing',
      lastAttempt: new Date().toISOString(),
    };
    await updateQueueItem(syncingItem);

    const startedAt = Date.now();

    try {
      await this.syncWithTimeout(syncingItem);

      // Success — remove from queue
      await removeFromQueue(item.id);
      logSync({ itemId: item.id, success: true, duration: Date.now() - startedAt });
      return { id: item.id, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      const newRetryCount = item.retryCount + 1;

      // Check for conflict (HTTP 409 or error carrying newer server data)
      const serverData = this.extractServerData(error);
      if (serverData && detectConflict(item, serverData)) {
        const conflictItem = preserveConflict(item, serverData);
        await updateQueueItem(conflictItem);
        return { id: item.id, success: false, error: 'Sync conflict: server data is newer' };
      }

      if (newRetryCount >= MAX_RETRIES) {
        // Max retries exhausted — mark as failed, retain in queue (Req 1.5, 12.7)
        const failedItem: SyncQueueItem = {
          ...item,
          status: 'failed',
          retryCount: newRetryCount,
          lastAttempt: new Date().toISOString(),
          error: errorMessage,
        };
        await updateQueueItem(failedItem);
        logSync({
          itemId: item.id,
          success: false,
          duration: Date.now() - startedAt,
          error: errorMessage,
        });
        return { id: item.id, success: false, error: errorMessage };
      }

      // Wait with exponential backoff before retry
      const backoffMs = calculateBackoff(item.retryCount);
      await this.delayFn(backoffMs);

      // Update retry count and re-queue as pending for next attempt
      const retriedItem: SyncQueueItem = {
        ...item,
        status: 'pending',
        retryCount: newRetryCount,
        lastAttempt: new Date().toISOString(),
        error: errorMessage,
      };
      await updateQueueItem(retriedItem);

      // Recursively retry
      return this.processItem(retriedItem);
    }
  }

  /**
   * Extract server data from a sync error, if present.
   * Supports errors with a `serverData` property (e.g., conflict responses)
   * or errors with a `status` of 409 (HTTP Conflict).
   */
  private extractServerData(error: unknown): unknown | null {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      // Direct server data attached to error
      if ('serverData' in err && err.serverData != null) {
        return err.serverData;
      }
      // HTTP 409 Conflict with response body
      if (err.status === 409 && 'data' in err && err.data != null) {
        return err.data;
      }
    }
    return null;
  }

  /**
   * Execute the sync function with a 30-second timeout.
   */
  private async syncWithTimeout(item: SyncQueueItem): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
      await Promise.race([
        this.syncFn(item),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('Sync timeout: operation exceeded 30 seconds'));
          });
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Utility sleep function for backoff delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
