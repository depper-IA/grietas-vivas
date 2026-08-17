/**
 * IndexedDB Wrapper — Local Database
 *
 * Typed wrapper around IndexedDB using the `idb` library.
 * Provides CRUD operations for captures and settings stores
 * with index-based queries and a 50-item capacity limit.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { LocalDBSchema, CaptureRecord, SettingsRecord } from './localSchema';
import type { SyncStatus } from '@/lib/sync/types';

/** Maximum number of captures allowed in IndexedDB (Req 1.3, 4.3). */
export const MAX_CAPTURES = 50;

const DB_NAME = 'safespace-local';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<LocalDBSchema> | null = null;

/**
 * Get or create the IndexedDB database instance.
 * Handles schema creation and index setup on first open.
 */
export async function getDb(): Promise<IDBPDatabase<LocalDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LocalDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create captures store with indexes
      if (!db.objectStoreNames.contains('captures')) {
        const capturesStore = db.createObjectStore('captures', { keyPath: 'id' });
        capturesStore.createIndex('by-status', 'syncStatus');
        capturesStore.createIndex('by-created', 'createdAt');
      }

      // Create settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// ---------------------------------------------------------------------------
// Captures CRUD
// ---------------------------------------------------------------------------

/**
 * Add a new capture to the store.
 * Rejects if the store has reached MAX_CAPTURES capacity (Req 4.7).
 */
export async function addCapture(capture: CaptureRecord): Promise<string> {
  const db = await getDb();
  const currentCount = await db.count('captures');

  if (currentCount >= MAX_CAPTURES) {
    throw new Error(
      `Local cache is full (${MAX_CAPTURES} items). Sync or delete items before adding new captures.`
    );
  }

  await db.put('captures', capture);
  return capture.id;
}

/** Get a single capture by ID. Returns undefined if not found. */
export async function getCapture(id: string): Promise<CaptureRecord | undefined> {
  const db = await getDb();
  return db.get('captures', id);
}

/** Get all captures, ordered by createdAt ascending (oldest first). */
export async function getAllCaptures(): Promise<CaptureRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('captures', 'by-created');
}

/**
 * Update an existing capture record.
 * Merges provided fields with the existing record.
 * Throws if the capture does not exist.
 */
export async function updateCapture(
  id: string,
  updates: Partial<Omit<CaptureRecord, 'id'>>
): Promise<CaptureRecord> {
  const db = await getDb();
  const existing = await db.get('captures', id);

  if (!existing) {
    throw new Error(`Capture with id "${id}" not found.`);
  }

  const updated: CaptureRecord = { ...existing, ...updates };
  await db.put('captures', updated);
  return updated;
}

/** Delete a capture by ID. No-op if not found. */
export async function deleteCapture(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('captures', id);
}

/** Get all captures matching a specific sync status. */
export async function getCapturesByStatus(status: SyncStatus): Promise<CaptureRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('captures', 'by-status', status);
}

/** Get the total count of captures in the store. */
export async function countCaptures(): Promise<number> {
  const db = await getDb();
  return db.count('captures');
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

/** Get the settings record. Returns undefined if not configured yet. */
export async function getSettings(key = 'default'): Promise<SettingsRecord | undefined> {
  const db = await getDb();
  return db.get('settings', key);
}

/** Save or update settings. */
export async function saveSettings(settings: SettingsRecord): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings);
}

/** Delete settings by key. */
export async function deleteSettings(key = 'default'): Promise<void> {
  const db = await getDb();
  await db.delete('settings', key);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Close the database connection and reset the cached instance.
 * Useful for testing or cleanup.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
