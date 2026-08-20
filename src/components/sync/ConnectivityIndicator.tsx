'use client';

/**
 * ConnectivityIndicator — Indicador persistente del estado de conectividad.
 *
 * Muestra un badge en la esquina superior derecha con el estado actual de red:
 * - En línea (Wifi verde)
 * - Sin conexión (WifiOff rojo/ámbar)
 * - Sincronizando (RefreshCw azul giratorio)
 *
 * Cero emojis: utiliza exclusivamente iconografía Lucide y tokens semánticos.
 * Se suscribe al singleton `connectivityMonitor`.
 */

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { connectivityMonitor } from '@/lib/connectivity/monitor';
import type { ConnectivityState } from '@/lib/connectivity/types';

interface StateConfig {
  label: string;
  Icon: LucideIcon;
  classes: string;
  iconClasses: string;
  srText: string;
}

/** Configuración visual en español y tokens semánticos para cada estado. */
const STATE_CONFIG: Record<ConnectivityState, StateConfig> = {
  online: {
    label: 'En línea',
    Icon: Wifi,
    classes: 'border-status-minor-border bg-surface-1/90 text-text-primary backdrop-blur-md',
    iconClasses: 'text-status-minor-bg',
    srText: 'Estado de red: conectado a internet',
  },
  offline: {
    label: 'Sin conexión',
    Icon: WifiOff,
    classes: 'border-status-critical-border bg-surface-1/90 text-text-primary backdrop-blur-md',
    iconClasses: 'text-status-critical-bg',
    srText: 'Estado de red: sin conexión (modo local offline)',
  },
  syncing: {
    label: 'Sincronizando',
    Icon: RefreshCw,
    classes: 'border-brand-accent/40 bg-surface-1/90 text-text-primary backdrop-blur-md animate-pulse',
    iconClasses: 'text-brand-accent animate-spin',
    srText: 'Estado de red: sincronizando datos con el servidor',
  },
};

export function ConnectivityIndicator() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ConnectivityState>('online');

  useEffect(() => {
    setMounted(true);
    // Inicializar el monitor (idempotente)
    connectivityMonitor.init();
    setState(connectivityMonitor.getState());

    // Suscripción y cleanup
    const unsubscribe = connectivityMonitor.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!mounted) {
    return null;
  }

  const config = STATE_CONFIG[state];
  const IconComponent = config.Icon;

  return (
    <div
      className={`fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-lg transition-all duration-150 ${config.classes}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <IconComponent className={`h-3.5 w-3.5 shrink-0 ${config.iconClasses}`} aria-hidden="true" />
      <span>{config.label}</span>
      <span className="sr-only">{config.srText}</span>
    </div>
  );
}
