/**
 * useConnectivity — React hook wrapping the ConnectivityMonitor singleton.
 *
 * Provides reactive connectivity state for components. Initializes the monitor
 * on mount, subscribes to state changes, and cleans up on unmount.
 *
 * Validates: Requirements 12.4
 */

import { useState, useEffect, useCallback } from 'react';
import { connectivityMonitor } from '@/lib/connectivity/monitor';
import type { ConnectivityState } from '@/lib/connectivity/types';

export interface UseConnectivityReturn {
  /** Current connectivity state */
  state: ConnectivityState;
  /** True when state is 'online' */
  isOnline: boolean;
  /** True when state is 'offline' */
  isOffline: boolean;
  /** True when state is 'syncing' */
  isSyncing: boolean;
  /** Actively check connectivity (HEAD request to /api/health) */
  checkConnectivity: () => Promise<boolean>;
}

/**
 * React hook that wraps the ConnectivityMonitor singleton.
 *
 * - Initializes the monitor on mount (binds online/offline listeners)
 * - Subscribes to state changes and updates React state
 * - Cleans up subscription on unmount
 */
export function useConnectivity(): UseConnectivityReturn {
  const [state, setState] = useState<ConnectivityState>(
    connectivityMonitor.getState(),
  );

  useEffect(() => {
    // Initialize the monitor (safe to call multiple times)
    connectivityMonitor.init();

    // Subscribe to state changes
    const unsubscribe = connectivityMonitor.subscribe((newState) => {
      setState(newState);
    });

    // Sync initial state in case it changed between render and effect
    setState(connectivityMonitor.getState());

    return () => {
      unsubscribe();
    };
  }, []);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    return connectivityMonitor.checkConnectivity();
  }, []);

  return {
    state,
    isOnline: state === 'online',
    isOffline: state === 'offline',
    isSyncing: state === 'syncing',
    checkConnectivity,
  };
}
