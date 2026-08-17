/**
 * Sync Queue — IndexedDB Persistence Layer
 *
 * Manages a dedicated IndexedDB store for the synchronization queue.
 * Items are stored independently from the captures store to separate
 * sync orchestration concerns from local data persistence.
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { SyncQueueItem, SyncStatus, QueueStatus } from './types';

/** Maximum items allowed in the sync queue (Req 4.7). */
export const MAX_QUEUE_SIZE = 50;

const DB_NAME = 'safespace-sync-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

/** Schema for the sync queue IndexedDB store. */
interface SyncQueueSchema extends DBSchema {
  queue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      'by-status': SyncStatus;
      'by-created': string;
    };
  };
}

let dbInstance: IDBPDatabase<SyncQueueSchema> | null = null;

/**
 * Get or create the sync queue database instance.
 */
export async function getSyncQueueDb(): Promise<IDBPDatabase<SyncQueueSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SyncQueueSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-created', 'createdAt');
      }
    },
  });

  return dbInstance;
}

// ---------------------------------------------------------------------------
// Queue CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Add an item to the sync queue.
 * Rejects if the queue has reached MAX_QUEUE_SIZE capacity.
 */
export async function addToQueue(item: SyncQueueItem): Promise<void> {
  const db = await getSyncQueueDb();
  const count = await db.count(STORE_NAME);

  if (count >= MAX_QUEUE_SIZE) {
    throw new Error(
      `Sync queue is full (${MAX_QUEUE_SIZE} items). Wait for items to sync or remove failed items.`
    );
  }

  await db.put(STORE_NAME, item);
}

/** Get a single queue item by ID. */
export async function getQueueItem(id: string): Promise<SyncQueueItem | undefined> {
  const db = await getSyncQueueDb();
  return db.get(STORE_NAME, id);
}

/**
 * Get all items with a specific status, ordered by createdAt ascending.
 */
export async function getItemsByStatus(status: SyncStatus): Promise<SyncQueueItem[]> {
  const db = await getSyncQueueDb();
  const all = await db.getAllFromIndex(STORE_NAME, 'by-status', status);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Get all items ordered by createdAt ascending (oldest first).
 */
export async function getAllQueueItems(): Promise<SyncQueueItem[]> {
  const db = await getSyncQueueDb();
  return db.getAllFromIndex(STORE_NAME, 'by-created');
}

/** Update a queue item in place. */
export async function updateQueueItem(item: SyncQueueItem): Promise<void> {
  const db = await getSyncQueueDb();
  await db.put(STORE_NAME, item);
}

/** Remove a queue item by ID. */
export async function removeFromQueue(id: string): Promise<void> {
  const db = await getSyncQueueDb();
  await db.delete(STORE_NAME, id);
}

/** Get aggregate queue status counts. */
export async function getQueueStatusCounts(): Promise<QueueStatus> {
  const db = await getSyncQueueDb();
  const all = await db.getAll(STORE_NAME);

  const pending = all.filter((i) => i.status === 'pending').length;
  const syncing = all.filter((i) => i.status === 'syncing').length;
  const failed = all.filter((i) => i.status === 'failed').length;
  const conflicts = all.filter((i) => i.status === 'conflict').length;
  const total = all.length;

  return {
    pending,
    syncing,
    failed,
    conflicts,
    total,
    isFull: total >= MAX_QUEUE_SIZE,
  };
}

/** Get total count of items in the queue. */
export async function getQueueCount(): Promise<number> {
  const db = await getSyncQueueDb();
  return db.count(STORE_NAME);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Close the sync queue database and reset the cached instance.
 */
export function closeSyncQueueDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
