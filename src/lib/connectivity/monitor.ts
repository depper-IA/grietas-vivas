/**
 * Connectivity Monitor — Implementation
 *
 * Observes browser online/offline events and implements the Observer pattern
 * to notify subscribers of connectivity state changes.
 *
 * Validates: Requirements 12.4
 */

import type { ConnectivityState, IConnectivityMonitor } from './types';

type Subscriber = (state: ConnectivityState) => void;

/**
 * ConnectivityMonitor observes the browser's network status using
 * `navigator.onLine` and window `online`/`offline` events.
 *
 * It implements the Observer pattern via `subscribe()` so UI components
 * and the Sync Manager can react to connectivity changes within 3 seconds.
 *
 * The Sync Manager can call `setState('syncing')` to reflect active sync state.
 */
export class ConnectivityMonitor implements IConnectivityMonitor {
  private state: ConnectivityState;
  private subscribers: Set<Subscriber> = new Set();
  private initialized = false;

  constructor() {
    this.state = typeof navigator !== 'undefined' && navigator.onLine
      ? 'online'
      : 'offline';
  }

  /**
   * Initialize event listeners. Call this once in the browser environment.
   * Safe to call multiple times — only binds listeners once.
   */
  init(): void {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.initialized = true;
  }

  /**
   * Tear down event listeners. Useful for testing and cleanup.
   */
  destroy(): void {
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.subscribers.clear();
    this.initialized = false;
  }

  /** Get the current connectivity state. */
  getState(): ConnectivityState {
    return this.state;
  }

  /**
   * Subscribe to connectivity state changes.
   * Returns an unsubscribe function.
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Actively check if the device has internet access by pinging a known endpoint.
   * Uses a lightweight HEAD request to avoid data transfer.
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const isOnline = response.ok;
      if (isOnline && this.state === 'offline') {
        this.updateState('online');
      } else if (!isOnline && this.state === 'online') {
        this.updateState('offline');
      }

      return isOnline;
    } catch {
      if (this.state !== 'syncing') {
        this.updateState('offline');
      }
      return false;
    }
  }

  /**
   * Set the connectivity state externally.
   * Used by the Sync Manager to set 'syncing' state during active synchronization.
   */
  setState(newState: ConnectivityState): void {
    this.updateState(newState);
  }

  // --- Private ---

  private handleOnline = (): void => {
    // Only update to 'online' if not currently syncing
    if (this.state !== 'syncing') {
      this.updateState('online');
    }
  };

  private handleOffline = (): void => {
    this.updateState('offline');
  };

  private updateState(newState: ConnectivityState): void {
    if (this.state === newState) return;

    this.state = newState;
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(this.state);
      } catch {
        // Swallow subscriber errors to avoid breaking the notification chain
      }
    });
  }
}

/** Singleton instance for app-wide use. */
export const connectivityMonitor = new ConnectivityMonitor();
