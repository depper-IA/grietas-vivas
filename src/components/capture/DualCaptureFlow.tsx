/**
 * DualCaptureFlow — Orquestador del flujo de captura dual + selector
 * de patron + checklist de senales (Spec R3-R7 de seismic-triage-upgrade).
 *
 * Encadena cuatro pasos en una sola superficie:
 *   1. Captura dual (DualCaptureHUD): foto de detalle (30-50 cm) y de
 *      contexto (2 m). Persigue ambas imagenes con un inspectionReportId
 *      compartido (R7).
 *   2. Selector de patron (CrackPatternSelector): el usuario elige uno
 *      de los 10 patrones canónicos (R1, R2).
 *   3. Checklist de senales (DangerSignalsChecklist): 5 booleanos que
 *      alimentan `evaluateSafetyOverride` (R3, R4).
 *   4. Resumen + submit: el usuario revisa y dispara `onComplete` con
 *      todos los datos. El caller (CapturePage) ejecuta la AI analysis
 *      y aplica el override de seguridad (R4) para garantizar
 *      pisos de seguridad.
 *
 * El flujo es controlado: no se puede saltar al step 4 sin haber
 * capturado ambas fotos, seleccionado un patron y revisado la checklist.
 * Por diseno, las senales pueden quedar todas en false (no son
 * obligatorias para enviar).
 *
 * Cero emojis: SVG Lucide + tokens. ARIA live para anuncios de paso.
 * Boton "Atras" y (opcional) "Cancelar" en todos los pasos.
 *
 * Ref: spec seismic-triage-upgrade R3-R7; design Slice 4 (Phase 4).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, X } from 'lucide-react';
import type {
  CrackPattern,
  DangerSignals,
} from '@/lib/validation/crackTaxonomy';
import { PATTERN_METADATA } from '@/lib/validation/crackTaxonomy';
import { DualCaptureHUD, type DualCaptureStep } from './DualCaptureHUD';
import { CrackPatternSelector } from './CrackPatternSelector';
import { DangerSignalsChecklist } from './DangerSignalsChecklist';
import { MotionButton } from '@/components/ui/MotionButton';

/** Paso visible del flow. */
export type DualCaptureFlowStep = 'capture' | 'pattern' | 'signals' | 'summary';

/** Estado inicial de las 5 senales de peligro (todas en false). */
export const DEFAULT_DANGER_SIGNALS: DangerSignals = {
  jammedDoorsWindows: false,
  unleveledFloors: false,
  tiltedElements: false,
  exposedRebarSpalling: false,
  throughWallXCracks: false,
};

/** Payload entregado al completarse el flow. */
export interface DualCaptureFlowResult {
  /** Blob de la foto de detalle (step 1 dentro de DualCaptureHUD). */
  detailImageBlob: Blob;
  /** Blob de la foto de contexto (step 2 dentro de DualCaptureHUD). */
  contextImageBlob: Blob | null;
  /** Patron seleccionado por el usuario. */
  pattern: CrackPattern;
  /** Senales de peligro marcadas. */
  dangerSignals: DangerSignals;
}

export interface DualCaptureFlowProps {
  /** Callback invocado al confirmar el step 4 con todos los datos. */
  onComplete: (result: DualCaptureFlowResult) => void;
  /** Callback opcional al pulsar "Cancelar". */
  onCancel?: () => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

const DEFAULT_ARIA_LABEL = 'Flujo de captura y clasificacion de grieta';

/**
 * Mapeo de `DualCaptureFlowStep` al numero visible del indicador de
 * paso (1/4, 2/4, etc.).
 */
const STEP_NUMBER: Record<DualCaptureFlowStep, number> = {
  capture: 1,
  pattern: 2,
  signals: 3,
  summary: 4,
};

/** Etiquetas en espanol para el breadcrumb de paso. */
const STEP_LABELS: Record<DualCaptureFlowStep, string> = {
  capture: 'Captura dual',
  pattern: 'Patron de la grieta',
  signals: 'Senales de peligro',
  summary: 'Confirmacion',
};

/**
 * Cuenta cuantas senales de peligro estan activas. Usado en el
 * resumen del step 4 para mostrar al usuario un conteo rapido.
 */
function countActiveSignals(signals: DangerSignals): number {
  return Object.values(signals).filter(Boolean).length;
}

/**
 * DualCaptureFlow — Componente publico.
 *
 * Mantiene exclusivamente estado de UI (paso, blobs, formulario). No
 * dispara analisis AI ni writes a Supabase: el caller decide como
 * procesar el payload recibido en `onComplete`.
 */
export function DualCaptureFlow({
  onComplete,
  onCancel,
  className = '',
}: DualCaptureFlowProps) {
  const [step, setStep] = useState<DualCaptureFlowStep>('capture');
  const [dualStep, setDualStep] = useState<DualCaptureStep>('detail');
  const [detailImageBlob, setDetailImageBlob] = useState<Blob | null>(null);
  const [contextImageBlob, setContextImageBlob] = useState<Blob | null>(null);
  const [pattern, setPattern] = useState<CrackPattern | null>(null);
  const [dangerSignals, setDangerSignals] = useState<DangerSignals>(
    DEFAULT_DANGER_SIGNALS
  );

  const detailPreviewUrl = useMemo(
    () => (detailImageBlob ? URL.createObjectURL(detailImageBlob) : null),
    [detailImageBlob]
  );

  useEffect(() => {
    return () => {
      if (detailPreviewUrl) URL.revokeObjectURL(detailPreviewUrl);
    };
  }, [detailPreviewUrl]);

  const handleCapture = useCallback(
    (blob: Blob, captureStep: DualCaptureStep) => {
      if (captureStep === 'detail') {
        setDetailImageBlob(blob);
        setDualStep('context');
      } else {
        setContextImageBlob(blob);
        setStep('pattern');
      }
    },
    []
  );

  const handleRetakeStep1 = useCallback(() => {
    setDetailImageBlob(null);
    setDualStep('detail');
  }, []);

  const goBack = useCallback(() => {
    if (step === 'pattern') setStep('capture');
    else if (step === 'signals') setStep('pattern');
    else if (step === 'summary') setStep('signals');
  }, [step]);

  const goForward = useCallback(() => {
    if (step === 'pattern') setStep('signals');
    else if (step === 'signals') setStep('summary');
  }, [step]);

  const canAdvance =
    (step === 'pattern' && pattern !== null) ||
    step === 'signals';

  const handleSubmit = useCallback(() => {
    if (!detailImageBlob || !pattern) return;
    onComplete({
      detailImageBlob,
      contextImageBlob,
      pattern,
      dangerSignals,
    });
  }, [detailImageBlob, contextImageBlob, pattern, dangerSignals, onComplete]);

  const patternMeta = pattern ? PATTERN_METADATA[pattern] : null;
  const activeSignalCount = countActiveSignals(dangerSignals);

  return (
    <section
      role="region"
      aria-label={DEFAULT_ARIA_LABEL}
      className={[
        'flex w-full flex-1 flex-col gap-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Announcer accesible: anuncia cambio de paso */}
      <p
        data-testid="dual-flow-step-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Paso {STEP_NUMBER[step]} de 4: {STEP_LABELS[step]}
      </p>

      {/* Header: indicador de paso + botones Cancelar / Atras */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {STEP_NUMBER[step]} / 4
          </p>
          <h2 className="text-base font-bold leading-tight text-text-primary sm:text-lg">
            {STEP_LABELS[step]}
          </h2>
        </div>
        {onCancel && (
          <button
            type="button"
            data-testid="dual-flow-cancel"
            onClick={onCancel}
            aria-label="Cancelar captura"
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-border-default bg-surface-2 px-3 py-2 text-sm font-semibold text-text-secondary transition-all duration-150 hover:border-border-strong hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <X className="h-4 w-4" aria-hidden="true" focusable="false" />
            <span>Cancelar</span>
          </button>
        )}
      </header>

      {/* Step 1: Captura dual */}
      {step === 'capture' && (
        <DualCaptureHUD
          step={dualStep}
          detailPreviewUrl={detailPreviewUrl}
          onCapture={handleCapture}
          onRetakeStep1={handleRetakeStep1}
        />
      )}

      {/* Step 2: Selector de patron */}
      {step === 'pattern' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-snug text-text-secondary">
            Selecciona el patron que mejor describe la grieta. Luego podras
            afinar con senales estructurales adicionales.
          </p>
          <CrackPatternSelector value={pattern} onChange={setPattern} />
        </div>
      )}

      {/* Step 3: Checklist de senales */}
      {step === 'signals' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-snug text-text-secondary">
            Marca las senales que observes durante la inspeccion. Las
            senales criticas disparan una alerta de evacuacion.
          </p>
          <DangerSignalsChecklist
            value={dangerSignals}
            onChange={setDangerSignals}
          />
        </div>
      )}

      {/* Step 4: Resumen y submit */}
      {step === 'summary' && (
        <div
          data-testid="dual-flow-summary"
          className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5"
        >
          <h3 className="text-sm font-semibold text-text-primary">
            Resumen de la inspeccion
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Patron seleccionado</dt>
              <dd className="text-right font-semibold text-text-primary">
                {patternMeta?.labelEs ?? 'Sin patron'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Riesgo base</dt>
              <dd className="text-right font-mono text-xs text-text-secondary">
                {patternMeta?.riskBaseline ?? 'N/A'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Senales activas</dt>
              <dd className="text-right font-semibold text-text-primary">
                {activeSignalCount} de 5
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-snug text-text-muted">
            Al confirmar se enviara la imagen al servicio de IA. Si las
            senales criticas o el patron indican peligro inminente, el
            resultado se eleva automaticamente a evacuacion.
          </p>
        </div>
      )}

      {/* Navegacion: Atras / Continuar / Submit */}
      <nav className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {step !== 'capture' && (
          <button
            type="button"
            data-testid="dual-flow-back"
            onClick={goBack}
            aria-label="Volver al paso anterior"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 px-4 py-3 text-sm font-semibold text-text-primary transition-all duration-150 hover:border-border-strong hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" focusable="false" />
            <span>Atras</span>
          </button>
        )}

        {step !== 'summary' && (
          <MotionButton
            type="button"
            data-testid="dual-flow-continue"
            onClick={goForward}
            disabled={!canAdvance}
            aria-label="Continuar al siguiente paso"
            buttonProps={{
              className:
                'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border-2 border-brand-cta bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-40',
            }}
          >
            <span>Continuar</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" focusable="false" />
          </MotionButton>
        )}

        {step === 'summary' && (
          <button
            type="button"
            data-testid="dual-flow-submit"
            onClick={handleSubmit}
            aria-label="Confirmar y enviar a analisis"
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-status-minor-border bg-status-minor px-4 py-3 text-sm font-semibold text-status-minor-fg shadow-sm transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-status-minor-border focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" focusable="false" />
            <span>Confirmar y Analizar</span>
          </button>
        )}
      </nav>
    </section>
  );
}
