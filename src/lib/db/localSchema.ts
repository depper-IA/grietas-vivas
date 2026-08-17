/**
 * IndexedDB Schema Definition
 *
 * Typed schema for the local IndexedDB database using the `idb` library.
 * Stores: captures (offline photo cache) and settings (app configuration).
 */

import type { DBSchema } from 'idb';
import type { CaptureMetadata } from '@/lib/capture/types';
import type { AnalysisResult } from '@/lib/ai/types';
import type { SyncStatus } from '@/lib/sync/types';
import type { AIConfig } from '@/lib/ai/types';

/** Shape of a capture record stored in IndexedDB. */
export interface CaptureRecord {
  id: string;
  imageBlob: Blob;
  metadata: CaptureMetadata;
  analysisResult: AnalysisResult | null;
  syncStatus: SyncStatus;
  retryCount: number;
  lastAttempt: string | null;
  error: string | null;
  createdAt: string;
}

/** Shape of the settings record stored in IndexedDB. */
export interface SettingsRecord {
  key: string;
  aiConfig: AIConfig;
  lastSyncAt: string | null;
}

/** Typed IndexedDB schema compatible with the `idb` DBSchema interface. */
export interface LocalDBSchema extends DBSchema {
  captures: {
    key: string;
    value: CaptureRecord;
    indexes: {
      'by-status': SyncStatus;
      'by-created': string;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}
