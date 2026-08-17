'use client';

export type GpsStatus = 'reliable' | 'low-accuracy' | 'unavailable';
export type OrientationStatus = 'available' | 'unavailable';

export interface MetadataIndicatorsProps {
  gpsStatus: GpsStatus;
  orientationStatus: OrientationStatus;
  /** Precisión GPS en metros cuando está disponible */
  gpsAccuracy?: number | null;
}

/**
 * MetadataIndicators — Muestra el estado del GPS y orientación con badges accesibles.
 *
 * GPS:
 *   - verde = fiable (precisión <= 50m)
 *   - amarillo = baja precisión (> 50m)
 *   - rojo = no disponible
 *
 * Orientación:
 *   - verde = API DeviceOrientation disponible
 *   - gris = no disponible
 */
export function MetadataIndicators({
  gpsStatus,
  orientationStatus,
  gpsAccuracy,
}: MetadataIndicatorsProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <GpsIndicator status={gpsStatus} accuracy={gpsAccuracy} />
      <OrientationIndicator status={orientationStatus} />
    </div>
  );
}

function GpsIndicator({
  status,
  accuracy,
}: {
  status: GpsStatus;
  accuracy?: number | null;
}) {
  const colorMap: Record<GpsStatus, string> = {
    reliable: 'bg-status-minor-bg',
    'low-accuracy': 'bg-status-moderate-bg',
    unavailable: 'bg-status-critical-bg',
  };

  const labelMap: Record<GpsStatus, string> = {
    reliable: `GPS fiable${accuracy != null ? ` (±${Math.round(accuracy)}m)` : ''}`,
    'low-accuracy': `GPS baja precisión${accuracy != null ? ` (±${Math.round(accuracy)}m)` : ''}`,
    unavailable: 'GPS no disponible',
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-text-primary bg-surface-2 border border-border-default shadow-sm"
      role="status"
      aria-label={labelMap[status]}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${colorMap[status]}`}
        aria-hidden="true"
      />
      <span className="sr-only">{labelMap[status]}</span>
      <span aria-hidden="true">GPS</span>
    </span>
  );
}

function OrientationIndicator({ status }: { status: OrientationStatus }) {
  const isAvailable = status === 'available';

  const ariaLabel = isAvailable
    ? 'Orientación del dispositivo disponible'
    : 'Orientación del dispositivo no disponible';

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-text-primary bg-surface-2 border border-border-default shadow-sm"
      role="status"
      aria-label={ariaLabel}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${isAvailable ? 'bg-status-minor-bg' : 'bg-text-muted'}`}
        aria-hidden="true"
      />
      <span className="sr-only">{ariaLabel}</span>
      <span aria-hidden="true">Nivel</span>
    </span>
  );
}
