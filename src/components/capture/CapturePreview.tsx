'use client';

import type { CaptureMetadata } from '@/lib/capture/types';
import { Camera, MapPin, Compass, Clock, Fingerprint } from 'lucide-react';

export interface CapturePreviewProps {
  /** URL del objeto de la imagen capturada */
  imageUrl: string;
  /** Resumen de metadatos de la captura */
  metadata: CaptureMetadata;
  /** Descartar vista previa y volver a la cámara */
  onDismiss: () => void;
}

/**
 * CapturePreview — Muestra la imagen capturada con una tarjeta de resumen de metadatos.
 * Muestra el estado del GPS, orientación y marca de tiempo tras una captura exitosa.
 */
export function CapturePreview({
  imageUrl,
  metadata,
  onDismiss,
}: CapturePreviewProps) {
  return (
    <section className="flex flex-col gap-4 w-full" aria-label="Vista previa de captura">
      {/* Imagen previa */}
      <div className="relative w-full aspect-[4/3] bg-surface-3 rounded-2xl overflow-hidden border border-border-default shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Fotografía capturada de la grieta"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Resumen de metadatos */}
      <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 text-sm text-text-secondary space-y-3 shadow-md">
        <h3 className="text-text-primary font-bold text-base flex items-center gap-2">
          <span>Detalles de la Captura</span>
        </h3>

        <div className="space-y-2.5">
          <MetadataRow
            icon={<MapPin className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />}
            label="GPS"
            value={
              metadata.gps.available && metadata.gps.latitude != null
                ? `${metadata.gps.latitude.toFixed(6)}, ${metadata.gps.longitude!.toFixed(6)} (±${Math.round(metadata.gps.accuracy!)}m)`
                : 'No disponible'
            }
            status={metadata.gps.reliable ? 'good' : metadata.gps.available ? 'warn' : 'error'}
          />

          <MetadataRow
            icon={<Compass className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />}
            label="Orientación"
            value={
              metadata.orientation.available
                ? `α:${metadata.orientation.alpha?.toFixed(0)}° β:${metadata.orientation.beta?.toFixed(0)}° γ:${metadata.orientation.gamma?.toFixed(0)}°`
                : 'No disponible'
            }
            status={metadata.orientation.available ? 'good' : 'neutral'}
          />

          <MetadataRow
            icon={<Clock className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />}
            label="Marca de tiempo"
            value={new Date(metadata.timestamp.local).toLocaleString('es-CO')}
            status={metadata.timestamp.verified ? 'good' : 'warn'}
            detail={metadata.timestamp.verified ? 'Verificado por servidor' : 'Local (sin verificar)'}
          />

          <MetadataRow
            icon={<Fingerprint className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />}
            label="Identificador"
            value={metadata.id.slice(0, 8) + '...'}
            status="neutral"
          />
        </div>
      </div>

      {/* Botón de acción */}
      <button
        type="button"
        onClick={onDismiss}
        className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 px-4 bg-surface-2 border border-border-default text-text-primary font-medium rounded-xl
          hover:bg-surface-3 active:scale-[0.98] transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
      >
        <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Tomar otra foto</span>
      </button>
    </section>
  );
}

type RowStatus = 'good' | 'warn' | 'error' | 'neutral';

function MetadataRow({
  icon,
  label,
  value,
  status,
  detail,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  status: RowStatus;
  detail?: string;
}) {
  const dotColor: Record<RowStatus, string> = {
    good: 'bg-status-minor-bg',
    warn: 'bg-status-moderate-bg',
    error: 'bg-status-critical-bg',
    neutral: 'bg-text-muted',
  };

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-surface-2/50 px-3 py-2 border border-border-subtle">
      {icon}
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotColor[status]}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <span className="text-text-muted text-xs font-medium">{label}:</span>{' '}
        <span className="text-text-primary font-mono tabular-nums text-xs sm:text-sm font-semibold break-all">{value}</span>
        {detail && (
          <span className="block text-[11px] text-text-muted mt-0.5">{detail}</span>
        )}
      </div>
    </div>
  );
}
