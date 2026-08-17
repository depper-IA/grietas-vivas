'use client';

import type { GpsStatus } from './MetadataIndicators';
import { AlertTriangle, MapPinOff } from 'lucide-react';

export interface GpsWarningBannerProps {
  gpsStatus: GpsStatus;
}

/**
 * GpsWarningBanner — Notificación visual persistente cuando el GPS está
 * no disponible o tiene baja precisión (Requisito 2.5).
 *
 * Solo se renderiza cuando el estado de GPS no es 'reliable'.
 */
export function GpsWarningBanner({ gpsStatus }: GpsWarningBannerProps) {
  if (gpsStatus === 'reliable') return null;

  const isUnavailable = gpsStatus === 'unavailable';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`w-full px-4 py-2 text-xs sm:text-sm font-semibold text-center flex items-center justify-center gap-2 border-b ${
        isUnavailable
          ? 'bg-status-critical/20 text-status-critical-fg border-status-critical-border'
          : 'bg-status-moderate/20 text-status-moderate-fg border-status-moderate-border'
      }`}
    >
      {isUnavailable ? (
        <MapPinOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>
        {isUnavailable
          ? 'GPS no disponible — los datos de ubicación no se incluirán en la captura'
          : 'GPS de baja precisión — los datos de ubicación pueden ser inexactos'}
      </span>
    </div>
  );
}
