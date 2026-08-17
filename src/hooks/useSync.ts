/**
 * useSync — React hook wrapping the SyncManager.
 *
 * Provides reactive queue status, auto-triggers processQueue on connectivity
 * restoration, supports Background Sync API registration, and retries failed
 * items when going back online.
 *
 * Validates: Requirements 1.4, 12.3
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSyncManager } from '@/lib/sync/syncManager';
import { connectivityMonitor } from '@/lib/connectivity/monitor';
import { syncCapture } from '@/app/actions/sync';
import type { ISyncManager, QueueStatus } from '@/lib/sync/types';
import type { SyncQueueItem } from '@/lib/sync/types';

/** Polling interval for queue status updates (5 seconds). */
const QUEUE_POLL_INTERVAL_MS = 5_000;

export interface UseSyncReturn {
  /** Aggregate queue status (pending, syncing, failed, total, isFull) */
  queueStatus: QueueStatus;
  /** True when the sync manager is actively processing the queue */
  isSyncing: boolean;
  /** Process all pending items in the queue */
  syncAll: () => Promise<void>;
  /** Reset failed items to pending and re-process */
  retryFailed: () => Promise<void>;
  /** Direct access to the sync manager for enqueue operations */
  syncManager: ISyncManager;
}

/** Default sync function that calls the server action. */
async function defaultSyncFn(item: SyncQueueItem): Promise<void> {
  const { captureResult } = item;

  // Convert Blob to base64
  const arrayBuffer = await captureResult.imageBlob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      '',
    ),
  );

  const result = await syncCapture({
    imageBase64: base64,
    metadata: captureResult.metadata,
    analysisResult: {
      riskLevel: 'low',
      description: 'Pending analysis',
      confidence: 0,
      provider: 'none',
      analyzedAt: new Date().toISOString(),
    },
  });

  if (!result.success) {
    throw new Error(result.error.message);
  }
}

/**
 * React hook that wraps the SyncManager.
 *
 * - Creates and caches a SyncManager instance
 * - Subscribes to connectivity changes: when going online → retryFailed + processQueue
 * - Registers Background Sync API where supported
 * - Polls queue status periodically
 */
export function useSync(): UseSyncReturn {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    pending: 0,
    syncing: 0,
    failed: 0,
    conflicts: 0,
    total: 0,
    isFull: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const syncManagerRef = useRef<ISyncManager | null>(null);

  // Lazily create the sync manager
  if (!syncManagerRef.current) {
    syncManagerRef.current = createSyncManager(defaultSyncFn);
  }

  const syncManager = syncManagerRef.current;

  /** Refresh queue status from the manager. */
  const refreshStatus = useCallback(async () => {
    try {
      const status = await syncManager.getQueueStatus();
      setQueueStatus(status);
    } catch {
      // Silently fail — queue might not be available yet
    }
  }, [syncManager]);

  /** Process all pending items. */
  const syncAll = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncManager.processQueue();
    } finally {
      setIsSyncing(false);
      await refreshStatus();
    }
  }, [syncManager, refreshStatus]);

  /** Retry failed items then process queue. */
  const retryFailed = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncManager.retryFailed();
      await syncManager.processQueue();
    } finally {
      setIsSyncing(false);
      await refreshStatus();
    }
  }, [syncManager, refreshStatus]);

  // Subscribe to connectivity changes: auto-sync on restoration
  useEffect(() => {
    let previousState = connectivityMonitor.getState();

    const unsubscribe = connectivityMonitor.subscribe((newState) => {
      // When transitioning TO online from offline/syncing
      if (newState === 'online' && previousState === 'offline') {
        // Auto-retry failed items and process queue
        void retryFailed();
      }
      previousState = newState;
    });

    return () => {
      unsubscribe();
    };
  }, [retryFailed]);

  // Register Background Sync API where supported
  useEffect(() => {
    async function registerBackgroundSync() {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          // @ts-expect-error — SyncManager API types not always available
          await registration.sync.register('sync-captures');
        } catch {
          // Background Sync not supported or failed — graceful degradation
        }
      }
    }

    registerBackgroundSync();
  }, []);

  // Poll queue status periodically
  useEffect(() => {
    // Initial load
    void refreshStatus();

    const intervalId = setInterval(() => {
      void refreshStatus();
    }, QUEUE_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshStatus]);

  return {
    queueStatus,
    isSyncing,
    syncAll,
    retryFailed,
    syncManager,
  };
}
