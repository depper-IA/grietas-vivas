/**
 * Unit tests for the IndexedDB wrapper (localDb).
 *
 * Uses fake-indexeddb to simulate IndexedDB in Node/jsdom.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { indexedDB } from 'fake-indexeddb';
import {
  getDb,
  closeDb,
  addCapture,
  getCapture,
  getAllCaptures,
  updateCapture,
  deleteCapture,
  getCapturesByStatus,
  countCaptures,
  getSettings,
  saveSettings,
  deleteSettings,
  MAX_CAPTURES,
} from './localDb';
import type { CaptureRecord, SettingsRecord } from './localSchema';

function makeCaptureRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: crypto.randomUUID(),
    imageBlob: new Blob(['test'], { type: 'image/jpeg' }),
    metadata: {
      id: crypto.randomUUID(),
      timestamp: { local: new Date().toISOString(), server: null, verified: false },
      gps: { latitude: 3.451, longitude: -76.532, accuracy: 10, available: true, reliable: true },
      orientation: { alpha: 90, beta: 45, gamma: 0, available: true },
      deviceInfo: { userAgent: 'test-agent', platform: 'test' },
    },
    analysisResult: null,
    syncStatus: 'pending',
    retryCount: 0,
    lastAttempt: null,
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function resetDb() {
  closeDb();
  // Delete the database entirely so tests start fresh
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('safespace-local');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('localDb — Captures CRUD', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('adds and retrieves a capture by id', async () => {
    const record = makeCaptureRecord();
    await addCapture(record);

    const retrieved = await getCapture(record.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(record.id);
    expect(retrieved!.syncStatus).toBe('pending');
  });

  it('returns undefined for non-existent capture', async () => {
    const result = await getCapture('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('getAllCaptures returns items ordered by createdAt', async () => {
    const older = makeCaptureRecord({ createdAt: '2024-01-01T00:00:00Z' });
    const newer = makeCaptureRecord({ createdAt: '2024-06-01T00:00:00Z' });

    await addCapture(newer);
    await addCapture(older);

    const all = await getAllCaptures();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(older.id);
    expect(all[1].id).toBe(newer.id);
  });

  it('updates an existing capture record', async () => {
    const record = makeCaptureRecord();
    await addCapture(record);

    const updated = await updateCapture(record.id, { syncStatus: 'synced', retryCount: 1 });
    expect(updated.syncStatus).toBe('synced');
    expect(updated.retryCount).toBe(1);

    const retrieved = await getCapture(record.id);
    expect(retrieved!.syncStatus).toBe('synced');
  });

  it('throws when updating a non-existent capture', async () => {
    await expect(updateCapture('non-existent', { syncStatus: 'synced' })).rejects.toThrow(
      'not found'
    );
  });

  it('deletes a capture by id', async () => {
    const record = makeCaptureRecord();
    await addCapture(record);
    await deleteCapture(record.id);

    const retrieved = await getCapture(record.id);
    expect(retrieved).toBeUndefined();
  });

  it('getCapturesByStatus filters correctly', async () => {
    const pending = makeCaptureRecord({ syncStatus: 'pending' });
    const synced = makeCaptureRecord({ syncStatus: 'synced' });
    const failed = makeCaptureRecord({ syncStatus: 'failed' });

    await addCapture(pending);
    await addCapture(synced);
    await addCapture(failed);

    const pendingItems = await getCapturesByStatus('pending');
    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0].id).toBe(pending.id);

    const syncedItems = await getCapturesByStatus('synced');
    expect(syncedItems).toHaveLength(1);
    expect(syncedItems[0].id).toBe(synced.id);
  });

  it('countCaptures returns the correct number', async () => {
    expect(await countCaptures()).toBe(0);

    await addCapture(makeCaptureRecord());
    await addCapture(makeCaptureRecord());

    expect(await countCaptures()).toBe(2);
  });

  it('rejects addCapture when MAX_CAPTURES is reached', async () => {
    // Fill to capacity
    for (let i = 0; i < MAX_CAPTURES; i++) {
      await addCapture(makeCaptureRecord({ createdAt: `2024-01-01T00:00:${String(i).padStart(2, '0')}Z` }));
    }

    expect(await countCaptures()).toBe(MAX_CAPTURES);

    await expect(addCapture(makeCaptureRecord())).rejects.toThrow('Local cache is full');
  });
});

describe('localDb — Settings CRUD', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('saves and retrieves settings', async () => {
    const settings: SettingsRecord = {
      key: 'default',
      aiConfig: {
        mode: 'fallback',
        fallbackPriority: ['openrouter', 'nvidia-nim'],
      },
      lastSyncAt: null,
    };

    await saveSettings(settings);
    const retrieved = await getSettings();
    expect(retrieved).toBeDefined();
    expect(retrieved!.aiConfig.mode).toBe('fallback');
    expect(retrieved!.aiConfig.fallbackPriority).toEqual(['openrouter', 'nvidia-nim']);
  });

  it('returns undefined when no settings exist', async () => {
    const result = await getSettings();
    expect(result).toBeUndefined();
  });

  it('deletes settings', async () => {
    const settings: SettingsRecord = {
      key: 'default',
      aiConfig: { mode: 'fallback', fallbackPriority: [] },
      lastSyncAt: '2024-01-01T00:00:00Z',
    };

    await saveSettings(settings);
    await deleteSettings();

    const result = await getSettings();
    expect(result).toBeUndefined();
  });
});
