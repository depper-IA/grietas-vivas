'use client';

import { useCallback, useState } from 'react';
import type { CaptureMetadata } from '@/lib/capture/types';
import { Camera, MapPin, Compass, Clock, Fingerprint, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveToDevice = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `grieta_${timestamp}.jpg`;

      const response = await fetch(imageUrl);
      const blob = await response.blob();

      if ('showSaveFilePicker' in window) {
        const handle = await (window as unknown as { showSaveFilePicker: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Imagen JPEG',
              accept: { 'image/jpeg': ['.jpg', '.jpeg'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSaveError('No se pudo guardar la foto');
      }
    } finally {
      setIsSaving(false);
    }
  }, [imageUrl]);

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
            value={formatOrientationValue(metadata.orientation)}
            status={
              metadata.orientation.available &&
              metadata.orientation.alpha !== null &&
              metadata.orientation.beta !== null &&
              metadata.orientation.gamma !== null
                ? 'good'
                : metadata.orientation.available
                  ? 'warn'
                  : 'neutral'
            }
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
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSaveToDevice}
          disabled={isSaving}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 px-4 bg-brand-cta text-white font-semibold rounded-xl
            hover:bg-brand-cta/90 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-brand-cta/20
            focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0
            disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isSaving ? (
              <motion.span
                key="saving"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Guardando...</span>
              </motion.span>
            ) : saveSuccess ? (
              <motion.span
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Guardada</span>
              </motion.span>
            ) : (
              <motion.span
                key="save"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Guardar en dispositivo</span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {saveError && (
          <p role="alert" className="text-xs text-status-critical-border font-medium text-center">{saveError}</p>
        )}

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
      </div>
    </section>
  );
}

type RowStatus = 'good' | 'warn' | 'error' | 'neutral';

/**
 * Formatea la lectura de orientacion del dispositivo para el resumen
 * de captura. Maneja tres casos:
 *   - Sensor no disponible o todos los ejes null -> "No disponible".
 *   - Al menos un eje con valor pero no los tres -> "Parcial: ..." con
 *     solo los ejes disponibles (evita imprimir "undefined°").
 *   - Tres ejes disponibles -> cadena completa con un decimal.
 */
function formatOrientationValue(
  orientation: CaptureMetadata['orientation']
): string {
  const { alpha, beta, gamma, available } = orientation;

  if (!available) return 'No disponible';

  const hasAlpha = alpha !== null;
  const hasBeta = beta !== null;
  const hasGamma = gamma !== null;
  const hasAll = hasAlpha && hasBeta && hasGamma;

  if (!hasAll) {
    const parts: string[] = [];
    if (hasAlpha) parts.push(`α:${alpha!.toFixed(0)}°`);
    if (hasBeta) parts.push(`β:${beta!.toFixed(0)}°`);
    if (hasGamma) parts.push(`γ:${gamma!.toFixed(0)}°`);
    return `Parcial: ${parts.join(' ')}`;
  }

  return `α:${alpha!.toFixed(0)}° β:${beta!.toFixed(0)}° γ:${gamma!.toFixed(0)}°`;
}

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
