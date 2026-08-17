'use client';

/**
 * SyncStatus — Panel de estado de la cola de sincronizacion.
 *
 * Muestra contadores de elementos pendientes y fallidos. Usa exclusivamente
 * iconos Lucide (cero emojis por diseno, REGLAS §9). Polling periodico
 * del estado de la cola IndexedDB y refresco reactivo a cambios de
 * conectividad.
 *
 *   - Almacenamiento lleno:    Database + AlertTriangle (critico)
 *   - Items fallidos:           AlertTriangle + contador
 *   - Conflictos de sync:       AlertTriangle + contador
 *   - Items pendientes:         Upload + contador
 *
 * Visual: tokens semanticos dark-first del slice 1
 * (surface-2, border-default, status-*-bg, etc.).
 *
 * Ref: spec `visual-redesign-core` (No Emojis in UI, Offline Sync Status).
 * Ref: REGLAS_IMPORTANTES.md §9 (prohibido emojis en UI).
 */

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Database, Upload } from 'lucide-react';
import { connectivityMonitor } from '@/lib/connectivity/monitor';
import { getQueueStatusCounts } from '@/lib/sync/queue';
import type { QueueStatus } from '@/lib/sync/types';

/** Polling interval for queue status updates (ms). */
const POLL_INTERVAL_MS = 5_000;

const DEFAULT_STATUS: QueueStatus = {
  pending: 0,
  syncing: 0,
  failed: 0,
  conflicts: 0,
  total: 0,
  isFull: false,
};

export function SyncStatus() {
  const [status, setStatus] = useState<QueueStatus>(DEFAULT_STATUS);

  const refreshStatus = useCallback(async () => {
    try {
      const queueStatus = await getQueueStatusCounts();
      setStatus(queueStatus);
    } catch {
      // IndexedDB may not be available (SSR, test env) — keep defaults
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refreshStatus();

    // Poll periodically
    const intervalId = setInterval(refreshStatus, POLL_INTERVAL_MS);

    // Also refresh on connectivity changes (sync events update the queue)
    const unsubscribe = connectivityMonitor.subscribe(() => {
      // Small delay to allow sync operations to update the queue
      setTimeout(refreshStatus, 1_000);
    });

    return () => {
      clearInterval(intervalId);
      unsubscribe();
    };
  }, [refreshStatus]);

  const hasPending = status.pending > 0 || status.syncing > 0;
  const hasFailed = status.failed > 0;
  const hasConflicts = status.conflicts > 0;
  const isFull = status.isFull;

  // Don't render anything if queue is empty and healthy
  if (!hasPending && !hasFailed && !hasConflicts && !isFull) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Storage full error */}
      {isFull && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-status-critical-border bg-status-critical text-status-critical-fg text-sm shadow-md"
          role="alert"
        >
          <Database
            aria-hidden="true"
            focusable="false"
            className="h-4 w-4 shrink-0"
          />
          <div>
            <p className="font-semibold">Almacenamiento lleno</p>
            <p className="text-xs opacity-90">
              No se pueden capturar nuevas fotos. Sincroniza elementos pendientes primero.
            </p>
          </div>
          <AlertTriangle
            aria-hidden="true"
            focusable="false"
            className="h-4 w-4 shrink-0 opacity-80"
          />
          <span className="sr-only">
            Error: el almacenamiento local esta lleno. No se pueden realizar nuevas capturas hasta sincronizar los elementos pendientes.
          </span>
        </div>
      )}

      {/* Failed items warning */}
      {hasFailed && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-status-moderate-border bg-status-moderate text-status-moderate-fg text-sm shadow-md"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            focusable="false"
            className="h-4 w-4 shrink-0"
          />
          <div>
            <p className="font-semibold">
              {status.failed} {status.failed === 1 ? 'elemento' : 'elementos'} no se sincronizaron
            </p>
            <p className="text-xs opacity-90">
              Se reintentara al restaurar la conexion.
            </p>
          </div>
          <span className="sr-only">
            Advertencia: {status.failed} {status.failed === 1 ? 'elemento no se ha' : 'elementos no se han'} sincronizado. Se reintentara automaticamente.
          </span>
        </div>
      )}

      {/* Conflict items notification (Req 12.5) */}
      {hasConflicts && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-accent/40 bg-surface-2 text-text-primary text-sm shadow-md"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            focusable="false"
            className="h-4 w-4 shrink-0 text-brand-accent"
          />
          <div>
            <p className="font-semibold">
              {status.conflicts} {status.conflicts === 1 ? 'elemento' : 'elementos'} en conflicto
            </p>
            <p className="text-xs text-text-secondary">
              El servidor tiene datos mas recientes. Ambas versiones se conservan.
            </p>
          </div>
          <span className="sr-only">
            Advertencia: {status.conflicts} {status.conflicts === 1 ? 'elemento tiene' : 'elementos tienen'} un conflicto de sincronizacion. Ambas versiones (local y servidor) se conservan sin perdida de datos.
          </span>
        </div>
      )}

      {/* Pending items counter */}
      {hasPending && !isFull && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-text-primary text-sm shadow-md">
          <Upload
            aria-hidden="true"
            focusable="false"
            className="h-4 w-4 shrink-0 text-brand-accent"
          />
          <p>
            <span className="font-semibold font-mono tabular-nums">
              {status.pending + status.syncing}
            </span>{' '}
            {status.pending + status.syncing === 1
              ? 'elemento pendiente de sincronizar'
              : 'elementos pendientes de sincronizar'}
          </p>
          <span className="sr-only">
            {status.pending + status.syncing}{' '}
            {status.pending + status.syncing === 1
              ? 'elemento esta'
              : 'elementos estan'}{' '}
            en espera de sincronizacion.
          </span>
        </div>
      )}
    </div>
  );
}
