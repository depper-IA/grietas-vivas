/**
 * DualCaptureFlow — Orquestador del flujo guiado de captura dual +
 * cuestionario estructural + selector de patron + checklist de senales
 * (Spec R1-R7 de seismic-triage-upgrade).
 *
 * Encadena cinco pasos en una sola superficie:
 *   1. Captura dual (DualCaptureHUD): foto de detalle (30-50 cm) y de
 *      contexto (2 m). Permite además subir fotos desde galería.
 *   2. Cuestionario estructural (StructuralQuestionnaire): recopila
 *      tipo de elemento, cruce completo, crecimiento post-sismo y escala.
 *   3. Selector de patron (CrackPatternSelector): el usuario elige uno
 *      de los 10 patrones canónicos FEMA 306 / NSR-10.
 *   4. Checklist de senales (DangerSignalsChecklist): 5 booleanos que
 *      alimentan `evaluateSafetyOverride`.
 *   5. Resumen + submit: el usuario revisa miniaturas, datos estructurales,
 *      patrón y señales, y dispara `onComplete` con todos los datos.
 *
 * Cero emojis: SVG Lucide + tokens. ARIA live para anuncios de paso.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  X,
  Building2,
  Ruler,
  Layers,
  AlertOctagon,
  Camera,
  Check,
  ShieldAlert,
} from 'lucide-react';
import type {
  CrackPattern,
  DangerSignals,
} from '@/lib/validation/crackTaxonomy';
import { PATTERN_METADATA } from '@/lib/validation/crackTaxonomy';
import type { StructuralContext } from '@/lib/ai/structuralPrompt';
import { DualCaptureHUD, type DualCaptureStep } from './DualCaptureHUD';
import { StructuralQuestionnaire } from './StructuralQuestionnaire';
import { CrackPatternSelector } from './CrackPatternSelector';
import { DangerSignalsChecklist } from './DangerSignalsChecklist';
import { MotionButton } from '@/components/ui/MotionButton';

/** Paso visible del flow. */
export type DualCaptureFlowStep =
  | 'capture'
  | 'questionnaire'
  | 'pattern'
  | 'signals'
  | 'summary';

/** Estado inicial de las 5 senales de peligro (todas en false). */
export const DEFAULT_DANGER_SIGNALS: DangerSignals = {
  jammedDoorsWindows: false,
  unleveledFloors: false,
  tiltedElements: false,
  exposedRebarSpalling: false,
  throughWallXCracks: false,
};

/** Contexto estructural por defecto. */
export const DEFAULT_STRUCTURAL_CONTEXT: StructuralContext = {
  elementType: 'other',
  crossesFullSpan: false,
  hasScaleReference: false,
  scaleReferenceType: 'none',
  recentGrowth: false,
};

/** Payload entregado al completarse el flow. */
export interface DualCaptureFlowResult {
  /** Blob de la foto de detalle (step 1 dentro de DualCaptureHUD). */
  detailImageBlob: Blob;
  /** Blob de la foto de contexto (step 2 dentro de DualCaptureHUD). */
  contextImageBlob: Blob | null;
  /** Contexto estructural del elemento inspeccionado. */
  structuralContext: StructuralContext;
  /** Patron seleccionado por el usuario. */
  pattern: CrackPattern;
  /** Senales de peligro marcadas. */
  dangerSignals: DangerSignals;
}

export interface DualCaptureFlowProps {
  /** Callback invocado al confirmar el step 5 con todos los datos. */
  onComplete: (result: DualCaptureFlowResult) => void;
  /** Callback opcional al pulsar "Cancelar". */
  onCancel?: () => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

const DEFAULT_ARIA_LABEL = 'Flujo de captura y clasificacion de grieta';

/**
 * Mapeo de `DualCaptureFlowStep` al numero visible del indicador de paso (1/5, etc.).
 */
const STEP_NUMBER: Record<DualCaptureFlowStep, number> = {
  capture: 1,
  questionnaire: 2,
  pattern: 3,
  signals: 4,
  summary: 5,
};

const STEP_LABELS: Record<DualCaptureFlowStep, string> = {
  capture: 'Captura dual',
  questionnaire: 'Cuestionario estructural',
  pattern: 'Patrón de la grieta',
  signals: 'Señales de peligro',
  summary: 'Confirmación',
};

const STEP_DESCRIPTIONS: Record<DualCaptureFlowStep, string> = {
  capture: 'Toma la foto de detalle con escala y la foto de contexto del entorno.',
  questionnaire: 'Especifica el tipo de elemento constructivo y características de la fisura.',
  pattern: 'Elige el tipo de patrón que mejor describe la forma de la grieta.',
  signals: 'Identifica si existen síntomas de riesgo estructural inminente.',
  summary: 'Revisa toda la información antes de procesar el análisis de IA.',
};

const ELEMENT_LABELS: Record<string, string> = {
  column: 'Columna',
  beam: 'Viga',
  'load-bearing-wall': 'Muro de carga (portante)',
  'partition-wall': 'Muro divisorio',
  slab: 'Placa / Techo',
  foundation: 'Cimiento',
  other: 'No especificado',
};

const SCALE_LABELS: Record<string, string> = {
  coin: 'Moneda (~24 mm)',
  card: 'Tarjeta (~85 mm)',
  hand: 'Mano humana (~8 cm)',
  ruler: 'Regla graduada',
  none: 'Ninguna',
};

/**
 * Cuenta cuantas senales de peligro estan activas.
 */
function countActiveSignals(signals: DangerSignals): number {
  return Object.values(signals).filter(Boolean).length;
}

/**
 * DualCaptureFlow — Orquestador del flujo guiado de captura y triaje.
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
  const [structuralContext, setStructuralContext] = useState<StructuralContext>(
    DEFAULT_STRUCTURAL_CONTEXT
  );
  const [pattern, setPattern] = useState<CrackPattern | null>(null);
  const [dangerSignals, setDangerSignals] = useState<DangerSignals>(
    DEFAULT_DANGER_SIGNALS
  );

  const detailPreviewUrl = useMemo(
    () => (detailImageBlob ? URL.createObjectURL(detailImageBlob) : null),
    [detailImageBlob]
  );

  const contextPreviewUrl = useMemo(
    () => (contextImageBlob ? URL.createObjectURL(contextImageBlob) : null),
    [contextImageBlob]
  );

  useEffect(() => {
    return () => {
      if (detailPreviewUrl) URL.revokeObjectURL(detailPreviewUrl);
    };
  }, [detailPreviewUrl]);

  useEffect(() => {
    return () => {
      if (contextPreviewUrl) URL.revokeObjectURL(contextPreviewUrl);
    };
  }, [contextPreviewUrl]);

  const handleCapture = useCallback(
    (blob: Blob, captureStep: DualCaptureStep) => {
      if (captureStep === 'detail') {
        setDetailImageBlob(blob);
        setDualStep('context');
      } else {
        setContextImageBlob(blob);
        setStep('questionnaire');
      }
    },
    []
  );

  const handleSkipContext = useCallback(() => {
    setContextImageBlob(null);
    setStep('questionnaire');
  }, []);

  const handleRetakeStep1 = useCallback(() => {
    setDetailImageBlob(null);
    setDualStep('detail');
  }, []);

  const handleQuestionnaireComplete = useCallback((ctx: StructuralContext) => {
    setStructuralContext(ctx);
    setStep('pattern');
  }, []);

  const handleQuestionnaireSkip = useCallback(() => {
    setStructuralContext(DEFAULT_STRUCTURAL_CONTEXT);
    setStep('pattern');
  }, []);

  const goBack = useCallback(() => {
    if (step === 'questionnaire') {
      setStep('capture');
    } else if (step === 'pattern') {
      setStep('questionnaire');
    } else if (step === 'signals') {
      setStep('pattern');
    } else if (step === 'summary') {
      setStep('signals');
    }
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
      structuralContext,
      pattern,
      dangerSignals,
    });
  }, [
    detailImageBlob,
    contextImageBlob,
    structuralContext,
    pattern,
    dangerSignals,
    onComplete,
  ]);

  const patternMeta = pattern ? PATTERN_METADATA[pattern] : null;
  const activeSignalCount = countActiveSignals(dangerSignals);
  const currentStepNum = STEP_NUMBER[step];

  return (
    <section
      role="region"
      aria-label={DEFAULT_ARIA_LABEL}
      className={[
        'flex w-full flex-1 flex-col gap-4 max-w-2xl mx-auto',
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
        Paso {currentStepNum} de 5: {STEP_LABELS[step]}
      </p>

      {/* Header con Stepper visual y botones */}
      <header className="flex flex-col gap-2.5 rounded-2xl border border-border-default bg-surface-1 p-3.5 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 px-2.5 items-center justify-center rounded-full bg-brand-accent text-xs font-bold text-white shadow-sm font-mono tabular-nums">
              {currentStepNum} / 5
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold leading-tight text-text-primary">
                {STEP_LABELS[step]}
              </h2>
              <p className="text-[11px] sm:text-xs text-text-secondary leading-tight">
                {STEP_DESCRIPTIONS[step]}
              </p>
            </div>
          </div>

          {onCancel && (
            <button
              type="button"
              data-testid="dual-flow-cancel"
              onClick={onCancel}
              aria-label="Cancelar captura"
              className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-all hover:bg-surface-3 hover:text-text-primary active:scale-95"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancelar</span>
            </button>
          )}
        </div>

        {/* Barra de progreso de 5 pasos */}
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {([1, 2, 3, 4, 5] as const).map((stepIdx) => {
            const isCompleted = stepIdx < currentStepNum;
            const isCurrent = stepIdx === currentStepNum;

            return (
              <div
                key={stepIdx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'bg-brand-accent ring-2 ring-brand-accent/20'
                    : isCompleted
                    ? 'bg-brand-accent/80'
                    : 'bg-surface-3'
                }`}
                title={`Paso ${stepIdx}`}
              />
            );
          })}
        </div>
      </header>

      {/* Step 1: Captura dual */}
      {step === 'capture' && (
        <DualCaptureHUD
          step={dualStep}
          detailPreviewUrl={detailPreviewUrl}
          onCapture={handleCapture}
          onRetakeStep1={handleRetakeStep1}
          onSkipContext={handleSkipContext}
        />
      )}

      {/* Step 2: Cuestionario estructural */}
      {step === 'questionnaire' && (
        <div className="flex flex-col gap-3">
          <StructuralQuestionnaire
            onComplete={handleQuestionnaireComplete}
            onSkip={handleQuestionnaireSkip}
          />
        </div>
      )}

      {/* Step 3: Selector de patron */}
      {step === 'pattern' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Tipología de Grieta (FEMA 306 / NSR-10)
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Selecciona la orientación y forma principal que observas en la estructura.
              </p>
            </div>
            <Layers className="h-5 w-5 text-brand-accent shrink-0" />
          </div>
          <CrackPatternSelector value={pattern} onChange={setPattern} />
        </div>
      )}

      {/* Step 4: Checklist de senales */}
      {step === 'signals' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Señales de Peligro Estructural
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Marca los síntomas de advertencia que observes en puertas, pisos o elementos vecinos.
              </p>
            </div>
            <ShieldAlert className="h-5 w-5 text-status-critical-fg shrink-0" />
          </div>
          <DangerSignalsChecklist
            value={dangerSignals}
            onChange={setDangerSignals}
          />
        </div>
      )}

      {/* Step 5: Resumen y submit */}
      {step === 'summary' && (
        <div
          data-testid="dual-flow-summary"
          className="flex flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h3 className="text-sm font-bold text-text-primary">
              Resumen de la Inspección Previa al Análisis
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-accent/10 text-brand-accent">
              Listo para IA
            </span>
          </div>

          {/* Miniaturas de fotos capturadas */}
          <div className="grid grid-cols-2 gap-3 pb-2 border-b border-border-subtle">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-text-muted">
                1. Foto Detalle (30-50 cm)
              </span>
              {detailPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detailPreviewUrl}
                  alt="Miniatura foto de detalle"
                  className="h-28 sm:h-32 w-full rounded-xl object-cover border border-border-default bg-surface-2 shadow-inner"
                />
              ) : (
                <div className="h-28 sm:h-32 w-full rounded-xl border border-border-default bg-surface-2 flex items-center justify-center text-xs text-text-muted">
                  Sin foto
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-text-muted">
                2. Foto Contexto (2 m)
              </span>
              {contextPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contextPreviewUrl}
                  alt="Miniatura foto de contexto"
                  className="h-28 sm:h-32 w-full rounded-xl object-cover border border-border-default bg-surface-2 shadow-inner"
                />
              ) : (
                <div className="h-28 sm:h-32 w-full rounded-xl border border-dashed border-border-default bg-surface-2/60 flex items-center justify-center text-xs text-text-muted text-center px-2">
                  Contexto omitido
                </div>
              )}
            </div>
          </div>

          {/* Datos del cuestionario y clasificación */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5 border border-border-subtle">
              <dt className="text-text-muted flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-brand-accent shrink-0" />
                <span>Elemento</span>
              </dt>
              <dd className="font-semibold text-text-primary text-right">
                {ELEMENT_LABELS[structuralContext.elementType] ||
                  structuralContext.elementType}
              </dd>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5 border border-border-subtle">
              <dt className="text-text-muted flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-brand-accent shrink-0" />
                <span>Escala métrica</span>
              </dt>
              <dd className="font-medium text-text-primary text-right">
                {SCALE_LABELS[structuralContext.scaleReferenceType || 'none']}
              </dd>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5 border border-border-subtle">
              <dt className="text-text-muted flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-brand-accent shrink-0" />
                <span>Patrón visual</span>
              </dt>
              <dd className="font-semibold text-text-primary text-right">
                {patternMeta?.labelEs ?? 'Sin patrón'}
              </dd>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5 border border-border-subtle">
              <dt className="text-text-muted flex items-center gap-1.5">
                <AlertOctagon className="h-4 w-4 text-status-critical-fg shrink-0" />
                <span>Señales activas</span>
              </dt>
              <dd className="font-semibold text-text-primary text-right">
                {activeSignalCount} de 5
              </dd>
            </div>
          </dl>

          <p className="text-[11px] leading-relaxed text-text-muted pt-2 border-t border-border-subtle">
            Al pulsar confirmar se enviará la información a los modelos de IA del servidor (o al motor heurístico offline de emergencia si estás sin red) para calcular el nivel de habitabilidad y emitir las recomendaciones forenses.
          </p>
        </div>
      )}

      {/* Navegacion: Atras / Continuar / Submit */}
      <nav className="flex flex-col gap-2.5 sm:flex-row sm:items-center pt-2">
        {step !== 'capture' && (
          <button
            type="button"
            data-testid="dual-flow-back"
            onClick={goBack}
            aria-label="Volver al paso anterior"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 px-5 py-3 text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Atrás</span>
          </button>
        )}

        {step !== 'summary' && step !== 'capture' && step !== 'questionnaire' && (
          <MotionButton
            type="button"
            data-testid="dual-flow-continue"
            onClick={goForward}
            disabled={!canAdvance}
            aria-label="Continuar al siguiente paso"
            buttonProps={{
              className:
                'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-cta bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-cta/90 focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-40',
            }}
          >
            <span>Continuar</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </MotionButton>
        )}

        {step === 'summary' && (
          <button
            type="button"
            data-testid="dual-flow-submit"
            onClick={handleSubmit}
            aria-label="Confirmar y enviar a análisis"
            className="flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand-cta px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-cta/25 transition-all duration-150 hover:bg-brand-cta/90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <ListChecks className="h-5 w-5" aria-hidden="true" />
            <span>Confirmar y Analizar con IA</span>
          </button>
        )}
      </nav>
    </section>
  );
}
