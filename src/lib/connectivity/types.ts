/**
 * Connectivity Monitor — Core Type Definitions
 *
 * Types for observing network state and coordinating
 * synchronization triggers.
 */

/** Current network connectivity state. */
export type ConnectivityState = 'online' | 'offline' | 'syncing';

/** Interface for monitoring and reacting to connectivity changes. */
export interface IConnectivityMonitor {
  /** Get the current connectivity state. */
  getState(): ConnectivityState;
  /** Subscribe to connectivity changes. Returns an unsubscribe function. */
  subscribe(callback: (state: ConnectivityState) => void): () => void;
  /** Actively check if the device has internet access. */
  checkConnectivity(): Promise<boolean>;
}
