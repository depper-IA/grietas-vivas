/**
 * Tests for conflict resolver — conflict detection and preservation.
 *
 * Validates: Requirements 12.5
 */

import { describe, it, expect } from 'vitest';
import { detectConflict, preserveConflict } from './conflictResolver';
import type { SyncQueueItem } from './types';

function createMockItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'test-item-1',
    captureResult: {
      id: 'test-item-1',
      imageBlob: new Blob(['fake-image'], { type: 'image/jpeg' }),
      metadata: {
        id: 'test-item-1',
        timestamp: { local: '2024-01-01T10:00:00.000Z', server: null, verified: false },
        gps: { latitude: null, longitude: null, accuracy: null, reliable: false },
        orientation: { alpha: null, beta: null, gamma: null, available: false },
        device: { userAgent: 'test', platform: 'test' },
      },
      createdAt: '2024-01-01T10:00:00.000Z',
    },
    status: 'syncing',
    retryCount: 0,
    lastAttempt: '2024-01-01T12:00:00.000Z',
    error: null,
    createdAt: '2024-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('detectConflict', () => {
  it('returns true when server updated_at is newer than local lastAttempt', () => {
    const item = createMockItem({ lastAttempt: '2024-01-01T12:00:00.000Z' });
    const serverData = { updated_at: '2024-01-01T13:00:00.000Z' };

    expect(detectConflict(item, serverData)).toBe(true);
  });

  it('returns false when server updated_at is older than local lastAttempt', () => {
    const item = createMockItem({ lastAttempt: '2024-01-01T12:00:00.000Z' });
    const serverData = { updated_at: '2024-01-01T11:00:00.000Z' };

    expect(detectConflict(item, serverData)).toBe(false);
  });

  it('returns false when server updated_at equals local lastAttempt', () => {
    const item = createMockItem({ lastAttempt: '2024-01-01T12:00:00.000Z' });
    const serverData = { updated_at: '2024-01-01T12:00:00.000Z' };

    expect(detectConflict(item, serverData)).toBe(false);
  });

  it('uses createdAt when lastAttempt is null', () => {
    const item = createMockItem({ lastAttempt: null, createdAt: '2024-01-01T10:00:00.000Z' });
    const serverData = { updated_at: '2024-01-01T11:00:00.000Z' };

    expect(detectConflict(item, serverData)).toBe(true);
  });

  it('returns false when serverData has no updated_at field', () => {
    const item = createMockItem();
    const serverData = { name: 'no timestamp' };

    expect(detectConflict(item, serverData)).toBe(false);
  });

  it('returns false when serverData is null', () => {
    const item = createMockItem();
    expect(detectConflict(item, null)).toBe(false);
  });

  it('returns false when serverData is not an object', () => {
    const item = createMockItem();
    expect(detectConflict(item, 'string')).toBe(false);
    expect(detectConflict(item, 42)).toBe(false);
  });

  it('returns false when updated_at is an invalid date string', () => {
    const item = createMockItem({ lastAttempt: '2024-01-01T12:00:00.000Z' });
    const serverData = { updated_at: 'not-a-date' };

    expect(detectConflict(item, serverData)).toBe(false);
  });
});

describe('preserveConflict', () => {
  it('returns item with status conflict', () => {
    const item = createMockItem();
    const serverData = { updated_at: '2024-01-02T00:00:00.000Z', risk_level: 'high' };

    const result = preserveConflict(item, serverData);

    expect(result.status).toBe('conflict');
  });

  it('stores server data in conflictData field', () => {
    const item = createMockItem();
    const serverData = { updated_at: '2024-01-02T00:00:00.000Z', risk_level: 'high' };

    const result = preserveConflict(item, serverData);

    expect(result.conflictData).toEqual(serverData);
  });

  it('preserves original captureResult (local version) untouched', () => {
    const item = createMockItem();
    const serverData = { updated_at: '2024-01-02T00:00:00.000Z' };

    const result = preserveConflict(item, serverData);

    expect(result.captureResult).toEqual(item.captureResult);
    expect(result.id).toBe(item.id);
    expect(result.createdAt).toBe(item.createdAt);
  });

  it('sets lastAttempt to current time', () => {
    const item = createMockItem({ lastAttempt: '2024-01-01T12:00:00.000Z' });
    const serverData = { updated_at: '2024-01-02T00:00:00.000Z' };

    const before = new Date().toISOString();
    const result = preserveConflict(item, serverData);
    const after = new Date().toISOString();

    expect(result.lastAttempt).not.toBeNull();
    expect(result.lastAttempt! >= before).toBe(true);
    expect(result.lastAttempt! <= after).toBe(true);
  });

  it('sets a descriptive error message', () => {
    const item = createMockItem();
    const serverData = { updated_at: '2024-01-02T00:00:00.000Z' };

    const result = preserveConflict(item, serverData);

    expect(result.error).toContain('conflict');
  });
});
