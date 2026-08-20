'use client';

/**
 * LazySyncWidgets — wrapper cliente para los widgets de conectividad/sync.
 *
 * `next/dynamic` con `ssr: false` ya no se permite dentro de un Server
 * Component (Next 15). ConnectivityIndicator y SyncStatus ya eran Client
 * Components, así que basta con mover el `dynamic(...)` a este wrapper
 * (también cliente) e importarlo desde el layout server-side.
 */

import dynamic from 'next/dynamic';

const ConnectivityIndicator = dynamic(
  () =>
    import('./ConnectivityIndicator').then((mod) => mod.ConnectivityIndicator),
  { ssr: false }
);

const SyncStatus = dynamic(
  () => import('./SyncStatus').then((mod) => mod.SyncStatus),
  { ssr: false }
);

export function LazyConnectivityIndicator() {
  return <ConnectivityIndicator />;
}

export function LazySyncStatus() {
  return <SyncStatus />;
}
