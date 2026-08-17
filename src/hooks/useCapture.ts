/**
 * useCapture — React hook wrapping the CaptureService.
 *
 * Provides a simple interface for capturing photos with full sensor metadata.
 * After successful capture, automatically enqueues the result to the sync manager.
 *
 * Validates: Requirements 1.4
 */

import { useState, useCallback, useRef } from 'react';
import { captureService } from '@/lib/capture/captureService';
import type { CaptureResult } from '@/lib/capture/types';
import type { ISyncManager } from '@/lib/sync/types';

/** Capture operation state. */
export type CaptureState = 'idle' | 'capturing' | 'done' | 'error';

export interface UseCaptureReturn {
  /** Trigger a photo capture with full metadata collection */
  capture: (imageBlob: Blob) => Promise<CaptureResult | null>;
  /** Whether a capture is currently in progress */
  isCapturing: boolean;
  /** Current capture state */
  captureState: CaptureState;
  /** Error from the last failed capture, null otherwise */
  error: Error | null;
  /** Result from the last successful capture, null otherwise */
  lastResult: CaptureResult | null;
}

export interface UseCaptureOptions {
  /** Sync manager instance to enqueue captures for synchronization */
  syncManager?: ISyncManager;
}

/**
 * React hook that wraps captureService.capture().
 *
 * - Orchestrates capture with state tracking (idle → capturing → done/error)
 * - After successful capture, enqueues the result to the sync manager
 * - Provides access to the last capture result and any errors
 */
export function useCapture(options: UseCaptureOptions = {}): UseCaptureReturn {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [lastResult, setLastResult] = useState<CaptureResult | null>(null);

  const syncManagerRef = useRef(options.syncManager);
  syncManagerRef.current = options.syncManager;

  const capture = useCallback(async (imageBlob: Blob): Promise<CaptureResult | null> => {
    setCaptureState('capturing');
    setError(null);

    try {
      const result = await captureService.capture(imageBlob);

      // Enqueue to sync manager if provided
      if (syncManagerRef.current) {
        try {
          await syncManagerRef.current.enqueue(result);
        } catch (enqueueError) {
          // Capture succeeded but enqueue failed (e.g., queue full)
          // The capture is still persisted in IndexedDB by captureService
          console.warn('[useCapture] Failed to enqueue capture for sync:', enqueueError);
        }
      }

      setLastResult(result);
      setCaptureState('done');
      return result;
    } catch (err) {
      const captureError = err instanceof Error ? err : new Error('Capture failed');
      setError(captureError);
      setCaptureState('error');
      return null;
    }
  }, []);

  return {
    capture,
    isCapturing: captureState === 'capturing',
    captureState,
    error,
    lastResult,
  };
}
