/**
 * DualCaptureHUD — Vista guiada para captura dual de fotos
 * (Spec R5, R6, R7 de seismic-triage-upgrade).
 *
 * Orquesta dos pasos:
 *   - step="detail"  : Foto de detalle a 30-50 cm con referencia de
 *                      escala (moneda o tarjeta). Guia al usuario con
 *                      un cuadro de encuadre cercano.
 *   - step="context" : Foto de contexto a ~2 metros. Encuadra columnas,
 *                      vigas y elementos estructurales del entorno.
 *                      Muestra thumbnail del step 1 para que el usuario
 *                      recuerde que ya capturo.
 *
 * El componente NO maneja el stream de camara — solo orquesta la
 * seleccion del archivo y la captura via un input file con `capture`
 * (mobile PWA). El caller (CapturePage) provee `step` segun su maquina
 * de estados interna y persiste el `inspectionReportId` a traves de
 * los dos pasos (R7).
 *
 * Cero emojis: SVG Lucide + tokens. ARIA live announcements para que
 * tecnologias asistivas anuncien el cambio de paso. Tap targets
 * >= 44px. Sin estado interno de captura.
 *
 * Ref: spec R5 (detail), R6 (context), R7 (inspectionReportId compartido).
 * Ref: design Slice 3 (Phase 3) de seismic-triage-upgrade.
 */

'use client';

import { useCallback, useRef } from 'react';
import {
  Camera,
  Coins,
  Maximize2,
  RefreshCw,
  Square,
} from 'lucide-react';

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
 * Renderizado como SVG para soportar tema oscuro y resize perfecto.
 */
function DetailFrame() {
  return (
    <div
      data-testid="dual-hud-scale-box"
      className="relative mx-auto h-48 w-48 rounded-2xl border-2 border-dashed border-triage-monitoring sm:h-56 sm:w-56"
    >
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
      {/* Texto guia interno */}
      <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs font-medium text-triage-monitoring-fg sm:text-sm">
        <Coins className="mr-1 inline-block h-4 w-4" aria-hidden="true" />
        Coloca una moneda o tarjeta al lado de la grieta
      </span>
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
      className="relative mx-auto h-48 w-64 rounded-2xl border-2 border-dashed border-triage-habitable sm:h-56 sm:w-80"
    >
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
      <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs font-medium text-triage-habitable-fg sm:text-sm">
        <Maximize2 className="mr-1 inline-block h-4 w-4" aria-hidden="true" />
        Enmarca columnas y vigas del entorno
      </span>
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
 * Mantiene un ref al input file para resolver el blob seleccionado en
 * click del boton de captura (sin pasar por un estado que cambie cada
 * tipeo). Es intencionalmente presentacional: la maquina de pasos vive
 * en el caller.
 */
export function DualCaptureHUD({
  step,
  detailPreviewUrl = null,
  onCapture,
  onRetakeStep1,
  className = '',
}: DualCaptureHUDProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureClick = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    onCapture(file, step);
    // Reset para permitir recapturar el mismo archivo
    input.value = '';
  }, [onCapture, step]);

  const handleFileChange = useCallback(() => {
    // El cambio de archivo por si solo no captura — espera al boton.
    // Esto permite al usuario re-seleccionar antes de confirmar.
  }, []);

  const isContext = step === 'context';

  return (
    <section
      role="region"
      aria-label={DEFAULT_ARIA_LABEL}
      className={[
        'flex w-full flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5',
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

      {/* Marco visual segun paso */}
      {isContext ? <ContextFrame /> : <DetailFrame />}

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

      {/* Input file oculto + boton de captura */}
      <input
        ref={fileInputRef}
        data-testid="dual-hud-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          data-testid="dual-hud-capture-button"
          onClick={handleCaptureClick}
          aria-label={
            isContext ? 'Capturar foto de contexto' : 'Capturar foto de detalle'
          }
          className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-triage-monitoring-border bg-triage-monitoring px-4 py-3 text-sm font-semibold text-triage-monitoring-fg shadow-sm transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-triage-monitoring-border focus:ring-offset-2 focus:ring-offset-surface-0"
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