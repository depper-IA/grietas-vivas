/**
 * DualCaptureHUD — Vista guiada para captura dual de fotos
 * (Spec R5, R6, R7 de seismic-triage-upgrade).
 *
 * Orquesta dos pasos:
 *   - step="detail"  : Foto de detalle a 30-50 cm con referencia de
 *                      escala (moneda o tarjeta). Guia al usuario con
 *                      un cuadro de encuadre cercano superpuesto a la
 *                      camara en vivo.
 *   - step="context" : Foto de contexto a ~2 metros. Encuadra columnas,
 *                      vigas y elementos estructurales del entorno.
 *                      Muestra thumbnail del step 1 para que el usuario
 *                      recuerde que ya capturo.
 *
 * A diferencia del flujo antiguo, este componente SI renderiza la
 * camara en vivo (`CameraViewfinder`) dentro del HUD. El usuario ve
 * la misma camara en el flujo de captura simple y en el dual: una
 * sola experiencia continua, sin necesidad de abrir la camara nativa
 * del SO mediante `<input type="file" capture>`. Los recuadros
 * `DetailFrame` / `ContextFrame` se dibujan como overlay encima del
 * visor.
 *
 * El componente maneja internamente el trigger de captura
 * (`captureRequested`) y el estado `isCapturing`. Cuando el usuario
 * pulsa el boton de captura, el snapshot se dispara contra la camara
 * en vivo y el blob resultante se propaga via `onCapture(blob, step)`.
 *
 * Cero emojis: SVG Lucide + tokens. ARIA live announcements para que
 * tecnologias asistivas anuncien el cambio de paso. Tap targets
 * >= 44px.
 *
 * Ref: spec R5 (detail), R6 (context), R7 (inspectionReportId compartido).
 * Ref: design Slice 3 (Phase 3) de seismic-triage-upgrade.
 */

'use client';

import { useCallback, useState } from 'react';
import {
  Camera,
  Coins,
  Maximize2,
  RefreshCw,
  Square,
} from 'lucide-react';
import { CameraViewfinder } from './CameraViewfinder';

/** Paso actual del flujo de captura dual. */
export type DualCaptureStep = 'detail' | 'context';

/** Props publicas del componente. */
export interface DualCaptureHUDProps {
  /** Paso actual: detail (R5) o context (R6). */
  step: DualCaptureStep;
  /** URL del blob/preview de la foto de detalle (para thumbnail en step 2). */
  detailPreviewUrl?: string | null;
  /** Callback invocado al confirmar captura: recibe (blob, step). */
  onCapture: (blob: Blob, step: DualCaptureStep) => void;
  /** Callback invocado al pulsar "Retomar foto 1" (solo en step=context). */
  onRetakeStep1: () => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

const DEFAULT_ARIA_LABEL = 'Captura dual de fotos';

/**
 * Marco de encuadre cercano (step=detail) con marcador de escala.
 * Renderizado como overlay absoluto sobre el `CameraViewfinder`.
 */
function DetailFrame() {
  return (
    <div
      data-testid="dual-hud-scale-box"
      className="pointer-events-none absolute inset-3 sm:inset-4 flex items-center justify-center"
    >
      <div className="relative aspect-square w-full max-w-[80%] max-h-[80%] rounded-2xl border-2 border-dashed border-triage-monitoring">
        {/* Esquinas resaltadas */}
        <span
          aria-hidden="true"
          className="absolute -top-1 -left-1 h-4 w-4 border-t-2 border-l-2 border-triage-monitoring-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 h-4 w-4 border-t-2 border-r-2 border-triage-monitoring-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-triage-monitoring-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-triage-monitoring-fg"
        />
        {/* Texto guia sobre banda semitransparente para no bloquear la grieta */}
        <span className="absolute inset-x-0 bottom-3 mx-auto flex max-w-[90%] items-center justify-center gap-1 rounded-md bg-black/65 px-2 py-1 text-center text-[11px] font-medium text-triage-monitoring-fg sm:text-xs">
          <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Coloca una moneda o tarjeta al lado de la grieta</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Marco de encuadre amplio (step=context) con marcadores de contexto
 * en las esquinas para ayudar a encuadrar columnas y vigas.
 */
function ContextFrame() {
  return (
    <div
      data-testid="dual-hud-context-frame"
      className="pointer-events-none absolute inset-3 sm:inset-4 flex items-center justify-center"
    >
      <div className="relative aspect-video w-full max-w-[90%] max-h-[85%] rounded-2xl border-2 border-dashed border-triage-habitable">
        <span
          aria-hidden="true"
          className="absolute -top-1 -left-1 h-4 w-4 border-t-2 border-l-2 border-triage-habitable-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 h-4 w-4 border-t-2 border-r-2 border-triage-habitable-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-triage-habitable-fg"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-triage-habitable-fg"
        />
        <span className="absolute inset-x-0 bottom-3 mx-auto flex max-w-[90%] items-center justify-center gap-1 rounded-md bg-black/65 px-2 py-1 text-center text-[11px] font-medium text-triage-habitable-fg sm:text-xs">
          <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Enmarca columnas y vigas del entorno</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Thumbnail pequeno de la foto de detalle capturada, visible solo
 * cuando estamos en step=context y existe un preview URL.
 */
function Step1Thumbnail({ src }: { src: string }) {
  return (
    <figure
      data-testid="dual-hud-step1-thumbnail"
      className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-2 p-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Miniatura de la foto de detalle capturada"
        className="h-12 w-12 rounded object-cover"
      />
      <figcaption className="text-xs text-text-secondary">
        Foto 1 (detalle) capturada
      </figcaption>
    </figure>
  );
}

/**
 * DualCaptureHUD — Componente publico.
 *
 * Mantiene internamente:
 *   - `captureRequested`: flag que se eleva a `true` cuando el usuario
 *     pulsa el boton de captura, y vuelve a `false` cuando
 *     `CameraViewfinder` confirma el snapshot (via `onCaptureComplete`).
 *   - `isCapturing`: estado intermedio entre el click y la propagacion
 *     del blob a `onCapture`, usado para deshabilitar el boton mientras
 *     se procesa la captura y evitar dobles disparos.
 */
export function DualCaptureHUD({
  step,
  detailPreviewUrl = null,
  onCapture,
  onRetakeStep1,
  className = '',
}: DualCaptureHUDProps) {
  const [captureRequested, setCaptureRequested] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleCaptureClick = useCallback(() => {
    if (isCapturing) return;
    setIsCapturing(true);
    setCaptureRequested(true);
  }, [isCapturing]);

  const handleCameraCapture = useCallback(
    (blob: Blob) => {
      onCapture(blob, step);
    },
    [onCapture, step]
  );

  const handleCameraCaptureComplete = useCallback(() => {
    setCaptureRequested(false);
    setIsCapturing(false);
  }, []);

  const handleCameraError = useCallback((message: string | null) => {
    setCameraError(message);
  }, []);

  const isContext = step === 'context';

  return (
    <section
      role="region"
      aria-label={DEFAULT_ARIA_LABEL}
      className={[
        'flex w-full flex-1 flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Announcer accesible (cambia con step) */}
      <p
        data-testid="dual-hud-step-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isContext
          ? 'Ahora foto de contexto'
          : 'Ahora foto de detalle'}
      </p>

      {/* Header: indicador de paso + titulo */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {isContext ? '2 / 2' : '1 / 2'}
          </p>
          <h2 className="text-base font-bold leading-tight text-text-primary sm:text-lg">
            {isContext
              ? 'Paso 2 de 2: Foto de Contexto (a 2 metros)'
              : 'Paso 1 de 2: Foto de Detalle (30-50 cm)'}
          </h2>
        </div>
        <Camera
          className="h-6 w-6 shrink-0 text-brand-accent"
          aria-hidden="true"
          focusable="false"
        />
      </header>

      {/* Visor de camara en vivo con overlay del marco segun paso */}
      <div
        data-testid="dual-hud-camera"
        className="relative w-full flex-1 min-h-[60vh]"
      >
        <CameraViewfinder
          captureRequested={captureRequested}
          onCapture={handleCameraCapture}
          onCaptureComplete={handleCameraCaptureComplete}
          onError={handleCameraError}
        />
        {isContext ? <ContextFrame /> : <DetailFrame />}
        {cameraError && (
          <p
            role="alert"
            className="mt-2 text-center text-xs text-status-critical-fg"
          >
            {cameraError}
          </p>
        )}
      </div>

      {/* Texto guia descriptivo */}
      <p className="text-sm leading-snug text-text-secondary">
        {isContext
          ? 'Aléjate unos 2 metros. Enmarca columnas, vigas y elementos estructurales del entorno para dar contexto del daño.'
          : 'Acercate a 30-50 cm de la grieta. Coloca una moneda o tarjeta al lado para tener referencia de escala.'}
      </p>

      {/* Thumbnail del step 1 cuando estamos en step 2 */}
      {isContext && detailPreviewUrl && (
        <Step1Thumbnail src={detailPreviewUrl} />
      )}

      {/* Botones de accion */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          data-testid="dual-hud-capture-button"
          onClick={handleCaptureClick}
          disabled={isCapturing}
          aria-label={
            isContext ? 'Capturar foto de contexto' : 'Capturar foto de detalle'
          }
          className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-triage-monitoring-border bg-triage-monitoring px-4 py-3 text-sm font-semibold text-triage-monitoring-fg shadow-sm transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-triage-monitoring-border focus:ring-offset-2 focus:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Square className="h-5 w-5" aria-hidden="true" focusable="false" />
          <span>{isContext ? 'Capturar contexto' : 'Capturar detalle'}</span>
        </button>

        {isContext && (
          <button
            type="button"
            data-testid="dual-hud-retake-step1"
            onClick={onRetakeStep1}
            aria-label="Retomar foto 1"
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 px-4 py-3 text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" focusable="false" />
            <span>Retomar foto 1</span>
          </button>
        )}
      </div>
    </section>
  );
}