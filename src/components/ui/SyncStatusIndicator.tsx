/**
 * SyncStatusIndicator — Primitiva visual de estado de sincronizacion.
 *
 * Comunica el estado de reconciliacion entre IndexedDB local y Supabase
 * remoto a traves de cuatro estados visuales:
 *
 *   - synced   (verde, CheckCircle2):  "Sincronizado"
 *   - pending  (ambar, Clock):         "Pendiente" + badge con contador
 *   - syncing  (azul marca, RefreshCw):"Sincronizando..." + pulse
 *   - error    (rojo, AlertCircle):    "Error de sincronizacion"
 *
 * Garantiza accesibilidad con role="status" + aria-live="polite".
 * No usa emojis: todo el icono viene de Lucide React.
 *
 * Ref: spec `visual-redesign-core` (Offline Sync Status Indicator).
 * Ref: design `SyncStatusIndicatorProps`.
 */

import {
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

/** Estados sincronizacion soportados por el indicador. */
export type SyncState = 'synced' | 'pending' | 'syncing' | 'error';

/** Props publicas del componente. */
export interface SyncStatusIndicatorProps {
  /** Estado actual de sincronizacion. */
  state: SyncState;
  /** Cantidad de elementos pendientes (solo aplica a state='pending'). */
  pendingCount?: number;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

interface StatePresentation {
  /** Etiqueta visible en espanol. */
  readonly label: string;
  /** aria-label completo del indicador. */
  readonly ariaLabel: (count: number | undefined) => string;
  /** Clases de tokens (color del icono + texto). */
  readonly toneClasses: string;
  /** Icono Lucide a renderizar. */
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Si el estado debe llevar clase de animacion. */
  readonly animate: boolean;
  /** Color del badge de pendientes (sobre pending). */
  readonly pendingBadgeClasses?: string;
}

const STATE_PRESENTATION: Record<SyncState, StatePresentation> = {
  synced: {
    label: 'Sincronizado',
    ariaLabel: () => 'Sincronizacion completa',
    toneClasses: 'text-status-minor-fg',
    Icon: CheckCircle2,
    animate: false,
  },
  pending: {
    label: 'Pendiente',
    ariaLabel: (count) =>
      count && count > 0
        ? `Pendiente de sincronizacion: ${count} elemento${count === 1 ? '' : 's'}`
        : 'Pendiente de sincronizacion',
    toneClasses: 'text-status-moderate-fg',
    Icon: Clock,
    animate: false,
    pendingBadgeClasses:
      'bg-status-moderate text-status-moderate-fg border-status-moderate-border',
  },
  syncing: {
    label: 'Sincronizando...',
    ariaLabel: () => 'Sincronizando en curso',
    toneClasses: 'text-brand-accent',
    Icon: RefreshCw,
    animate: true,
  },
  error: {
    label: 'Error de sincronización',
    ariaLabel: () => 'Error de sincronizacion',
    toneClasses: 'text-status-critical-fg',
    Icon: AlertCircle,
    animate: false,
  },
};

/** Umbral para mostrar "99+" en lugar del contador crudo. */
const PENDING_COUNT_CAP = 99;

/** Formatea el contador pendiente (cap a "99+"). */
function formatPendingCount(count: number | undefined): string | null {
  if (count === undefined || count <= 0) return null;
  if (count > PENDING_COUNT_CAP) return `${PENDING_COUNT_CAP}+`;
  return String(count);
}

export function SyncStatusIndicator({
  state,
  pendingCount,
  className = '',
}: SyncStatusIndicatorProps) {
  const presentation = STATE_PRESENTATION[state];
  const { Icon } = presentation;
  const showCount = state === 'pending';
  const formattedCount = showCount ? formatPendingCount(pendingCount) : null;
  const ariaLabel = presentation.ariaLabel(
    showCount ? pendingCount : undefined
  );

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={ariaLabel}
      data-state={state}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1',
        'border border-border-subtle bg-surface-1',
        'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
        presentation.animate ? 'animate-sync-pulse' : '',
        presentation.toneClasses,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        className="h-3.5 w-3.5 shrink-0"
      />
      <span className="text-xs font-medium">{presentation.label}</span>
      {formattedCount !== null && (
        <span
          data-testid="pending-count"
          aria-hidden="true"
          className={[
            'ml-1 inline-flex min-w-[1.25rem] items-center justify-center',
            'rounded-full border px-1.5 text-[10px] font-semibold tabular-nums',
            presentation.pendingBadgeClasses,
          ].join(' ')}
        >
          {formattedCount}
        </span>
      )}
    </span>
  );
}