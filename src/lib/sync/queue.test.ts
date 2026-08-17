/**
 * Unit tests for the sync queue IndexedDB persistence layer.
 *
 * Uses fake-indexeddb to simulate IndexedDB in Node/jsdom.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { indexedDB } from 'fake-indexeddb';
import type { SyncQueueItem } from './types';
import type { CaptureResult } from '@/lib/capture/types';
import {
  getSyncQueueDb,
  closeSyncQueueDb,
  addToQueue,
  getQueueItem,
  getItemsByStatus,
  getAllQueueItems,
  updateQueueItem,
  removeFromQueue,
  getQueueStatusCounts,
  getQueueCount,
  MAX_QUEUE_SIZE,
} from './queue';

function makeCaptureResult(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    id: crypto.randomUUID(),
    imageBlob: new Blob(['test-image'], { type: 'image/jpeg' }),
    metadata: {
      id: crypto.randomUUID(),
      timestamp: { local: new Date().toISOString(), server: null, verified: false },
      gps: { latitude: 3.451, longitude: -76.532, accuracy: 10, available: true, reliable: true },
      orientation: { alpha: 90, beta: 45, gamma: 0, available: true },
      deviceInfo: { userAgent: 'test-agent', platform: 'test' },
    },
    status: 'pending_sync',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQueueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  const capture = makeCaptureResult();
  return {
    id: capture.id,
    captureResult: capture,
    status: 'pending',
    retryCount: 0,
    lastAttempt: null,
    error: null,
    createdAt: capture.createdAt,
    ...overrides,
  };
}

async function resetDb() {
  closeSyncQueueDb();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('safespace-sync-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('sync/queue — CRUD operations', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    closeSyncQueueDb();
  });

  it('adds and retrieves an item by ID', async () => {
    const item = makeQueueItem();
    await addToQueue(item);

    const retrieved = await getQueueItem(item.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(item.id);
    expect(retrieved!.status).toBe('pending');
  });

  it('returns undefined for non-existent item', async () => {
    const result = await getQueueItem('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('getAllQueueItems returns items ordered by createdAt ascending', async () => {
    const older = makeQueueItem({ createdAt: '2024-01-01T00:00:00Z' });
    const newer = makeQueueItem({ createdAt: '2024-06-01T00:00:00Z' });

    await addToQueue(newer);
    await addToQueue(older);

    const all = await getAllQueueItems();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(older.id);
    expect(all[1].id).toBe(newer.id);
  });

  it('getItemsByStatus filters and orders correctly', async () => {
    const pending1 = makeQueueItem({ status: 'pending', createdAt: '2024-01-02T00:00:00Z' });
    const pending2 = makeQueueItem({ status: 'pending', createdAt: '2024-01-01T00:00:00Z' });
    const failed = makeQueueItem({ status: 'failed' });

    await addToQueue(pending1);
    await addToQueue(pending2);
    await addToQueue(failed);

    const pendingItems = await getItemsByStatus('pending');
    expect(pendingItems).toHaveLength(2);
    // Oldest first
    expect(pendingItems[0].id).toBe(pending2.id);
    expect(pendingItems[1].id).toBe(pending1.id);

    const failedItems = await getItemsByStatus('failed');
    expect(failedItems).toHaveLength(1);
    expect(failedItems[0].id).toBe(failed.id);
  });

  it('updates a queue item in place', async () => {
    const item = makeQueueItem();
    await addToQueue(item);

    const updated: SyncQueueItem = { ...item, status: 'syncing', retryCount: 1 };
    await updateQueueItem(updated);

    const retrieved = await getQueueItem(item.id);
    expect(retrieved!.status).toBe('syncing');
    expect(retrieved!.retryCount).toBe(1);
  });

  it('removes an item from the queue', async () => {
    const item = makeQueueItem();
    await addToQueue(item);
    await removeFromQueue(item.id);

    const retrieved = await getQueueItem(item.id);
    expect(retrieved).toBeUndefined();
  });

  it('getQueueCount returns total item count', async () => {
    expect(await getQueueCount()).toBe(0);

    await addToQueue(makeQueueItem());
    await addToQueue(makeQueueItem());

    expect(await getQueueCount()).toBe(2);
  });

  it('getQueueStatusCounts aggregates statuses correctly', async () => {
    await addToQueue(makeQueueItem({ status: 'pending' }));
    await addToQueue(makeQueueItem({ status: 'pending' }));
    await addToQueue(makeQueueItem({ status: 'failed' }));
    await addToQueue(makeQueueItem({ status: 'syncing' }));

    const status = await getQueueStatusCounts();
    expect(status.pending).toBe(2);
    expect(status.syncing).toBe(1);
    expect(status.failed).toBe(1);
    expect(status.total).toBe(4);
    expect(status.isFull).toBe(false);
  });

  it('rejects addToQueue when MAX_QUEUE_SIZE is reached', async () => {
    for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
      await addToQueue(
        makeQueueItem({ createdAt: `2024-01-01T00:00:${String(i).padStart(2, '0')}Z` })
      );
    }

    expect(await getQueueCount()).toBe(MAX_QUEUE_SIZE);
    await expect(addToQueue(makeQueueItem())).rejects.toThrow('Sync queue is full');
  });

  it('isFull is true when queue reaches capacity', async () => {
    for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
      await addToQueue(
        makeQueueItem({ createdAt: `2024-01-01T00:00:${String(i).padStart(2, '0')}Z` })
      );
    }

    const status = await getQueueStatusCounts();
    expect(status.isFull).toBe(true);
  });
});
