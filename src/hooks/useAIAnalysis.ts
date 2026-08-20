/**
 * useAIAnalysis — React hook wrapping the AI Service Adapter.
 *
 * Provides AI crack analysis with automatic retry when all fallbacks fail.
 * Retries after 15 minutes or on connectivity restoration (whichever comes first).
 * Cleans up pending retries on unmount.
 *
 * Validates: Requirements 6.4
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { aiService } from '@/lib/ai/aiService';
import { connectivityMonitor } from '@/lib/connectivity/monitor';
import type { AnalysisResult, AIConfig } from '@/lib/ai/types';

/** Retry delay in milliseconds (15 minutes). */
const RETRY_DELAY_MS = 15 * 60 * 1000;

/** Analysis operation state. */
export type AnalysisState = 'idle' | 'analyzing' | 'done' | 'error' | 'retrying';

export interface UseAIAnalysisReturn {
  /** Trigger AI analysis on an image */
  analyze: (image: Blob, config: AIConfig) => Promise<AnalysisResult | null>;
  /** Whether analysis is currently in progress */
  isAnalyzing: boolean;
  /** Current analysis state */
  analysisState: AnalysisState;
  /** The analysis result when successful */
  result: AnalysisResult | null;
  /** Error from the last failed analysis attempt */
  error: Error | null;
  /** Whether the weekly fallback limit has been reached */
  limitReached: boolean;
  /** Manually trigger a retry of the last failed analysis */
  retry: () => Promise<AnalysisResult | null>;
}

/**
 * React hook that wraps the AI Service Adapter.
 *
 * - Manages analysis lifecycle state (idle → analyzing → done/error/retrying)
 * - When analysis fails (all fallbacks exhausted), schedules automatic retry:
 *   - 15-minute timer OR connectivity restoration (whichever comes first)
 * - Cancels pending retries on unmount
 * - Subscribes to connectivity monitor for retry-on-restore behavior
 */
export function useAIAnalysis(): UseAIAnalysisReturn {
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Track pending retry state
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectivityUnsubRef = useRef<(() => void) | null>(null);
  const lastRequestRef = useRef<{ image: Blob; config: AIConfig } | null>(null);
  const mountedRef = useRef(true);
  const limitReachedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearRetrySchedule();
    };
  }, []);

  /** Clear all pending retry timers and subscriptions. */
  function clearRetrySchedule(): void {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (connectivityUnsubRef.current) {
      connectivityUnsubRef.current();
      connectivityUnsubRef.current = null;
    }
  }

  /** Execute the analysis against the AI service. */
  const executeAnalysis = useCallback(
    async (image: Blob, config: AIConfig): Promise<AnalysisResult | null> => {
      try {
        const analysisResult = await aiService.analyze(image, config);

        if (!mountedRef.current) return null;

        setResult(analysisResult);
        setError(null);
        setLimitReached(false);
        setAnalysisState('done');
        clearRetrySchedule();
        return analysisResult;
      } catch (err) {
        if (!mountedRef.current) return null;

        const analysisError =
          err instanceof Error ? err : new Error('Analysis failed');

        const isLimitReached = analysisError.message.includes('FALLBACK_LIMIT_REACHED');
        setLimitReached(isLimitReached);
        limitReachedRef.current = isLimitReached;

        setError(analysisError);
        return null;
      }
    },
    [],
  );

  /** Schedule a retry: 15-minute timer + connectivity restoration listener. */
  const scheduleRetry = useCallback(
    (image: Blob, config: AIConfig): void => {
      // Clean up any previous schedule
      clearRetrySchedule();
      setAnalysisState('retrying');

      const doRetry = async () => {
        if (!mountedRef.current) return;

        clearRetrySchedule();
        setAnalysisState('analyzing');

        const retryResult = await executeAnalysis(image, config);

        // If retry also failed, schedule another retry
        if (!retryResult && mountedRef.current) {
          setAnalysisState('error');
          scheduleRetry(image, config);
        }
      };

      // Timer: retry after 15 minutes
      retryTimerRef.current = setTimeout(() => {
        void doRetry();
      }, RETRY_DELAY_MS);

      // Connectivity: retry on restoration
      let previousState = connectivityMonitor.getState();
      connectivityUnsubRef.current = connectivityMonitor.subscribe(
        (newState) => {
          if (newState === 'online' && previousState === 'offline') {
            void doRetry();
          }
          previousState = newState;
        },
      );
    },
    [executeAnalysis],
  );

  /** Primary analyze function exposed to consumers. */
  const analyze = useCallback(
    async (image: Blob, config: AIConfig): Promise<AnalysisResult | null> => {
      lastRequestRef.current = { image, config };

      setAnalysisState('analyzing');
      setError(null);
      setResult(null);
      setLimitReached(false);
      limitReachedRef.current = false;
      clearRetrySchedule();

      const analysisResult = await executeAnalysis(image, config);

      if (!analysisResult && mountedRef.current) {
        if (limitReachedRef.current) {
          setAnalysisState('error');
        } else {
          setAnalysisState('error');
          scheduleRetry(image, config);
        }
      }

      return analysisResult;
    },
    [executeAnalysis, scheduleRetry],
  );

  /** Manual retry of the last failed analysis. */
  const retry = useCallback(async (): Promise<AnalysisResult | null> => {
    if (!lastRequestRef.current) return null;

    const { image, config } = lastRequestRef.current;
    return analyze(image, config);
  }, [analyze]);

  return {
    analyze,
    isAnalyzing: analysisState === 'analyzing' || analysisState === 'retrying',
    analysisState,
    result,
    error,
    limitReached,
    retry,
  };
}
