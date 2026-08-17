/**
 * Photo Capture Service — Orchestrator
 *
 * Coordinates image capture with GPS, device orientation, and
 * certified timestamps. Persists the complete CaptureResult to
 * IndexedDB for offline-first operation.
 */

import type { CaptureMetadata, CaptureResult } from './types';
import { getCurrentPosition } from './gps';
import { getDeviceOrientation } from './orientation';
import { getServerTimestamp } from './timestamp';
import { addCapture } from '@/lib/db/localDb';
import type { CaptureRecord } from '@/lib/db/localSchema';

/**
 * Interface for the capture service.
 * Orchestrates image capture with all associated sensor metadata.
 */
export interface ICaptureService {
  capture(imageBlob: Blob): Promise<CaptureResult>;
  getServerTimestamp(): Promise<CaptureMetadata['timestamp']>;
  getCurrentPosition(): Promise<CaptureMetadata['gps']>;
  getDeviceOrientation(): Promise<CaptureMetadata['orientation']>;
}

/**
 * Capture service implementation.
 *
 * Orchestrates: UUID generation → GPS reading → orientation reading →
 * server timestamp → metadata assembly → IndexedDB persistence.
 */
export const captureService: ICaptureService = {
  async capture(imageBlob: Blob): Promise<CaptureResult> {
    const id = crypto.randomUUID();

    // Collect sensor metadata in parallel where possible
    const [gps, orientation, timestamp] = await Promise.all([
      getCurrentPosition(),
      getDeviceOrientation(),
      getServerTimestamp(),
    ]);

    const metadata: CaptureMetadata = {
      id,
      timestamp,
      gps,
      orientation,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      },
    };

    const captureResult: CaptureResult = {
      id,
      imageBlob,
      metadata,
      status: 'pending_sync',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Persist to IndexedDB for offline-first resilience
    const record: CaptureRecord = {
      id: captureResult.id,
      imageBlob: captureResult.imageBlob,
      metadata: captureResult.metadata,
      analysisResult: null,
      syncStatus: 'pending',
      retryCount: captureResult.retryCount,
      lastAttempt: null,
      error: null,
      createdAt: captureResult.createdAt,
    };

    await addCapture(record);

    return captureResult;
  },

  async getServerTimestamp() {
    return getServerTimestamp();
  },

  async getCurrentPosition() {
    return getCurrentPosition();
  },

  async getDeviceOrientation() {
    return getDeviceOrientation();
  },
};
