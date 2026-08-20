'use client';

import { useMemo, useState } from 'react';
import type { StructuralContext } from '@/lib/ai/structuralPrompt';
import {
  Building2,
  Ruler,
  Layers,
  DoorClosed,
  Square,
  HardHat,
  HelpCircle,
  MoveHorizontal,
  ArrowRight,
  TrendingUp,
  MinusCircle,
  Coins,
  Hand,
  XCircle,
  ChevronLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  onComplete: (context: StructuralContext) => void;
  onSkip: () => void;
}

interface OptionItem<T> {
  label: string;
  value: T;
  Icon: LucideIcon;
}

interface QuestionDef {
  question: string;
  subtitle?: string;
  options: OptionItem<unknown>[];
}

/** Identificador de cada paso del cuestionario. `coinDenomination` solo aparece
 * cuando el usuario indica que usó una moneda como referencia de escala. */
type StepId = 'element' | 'crosses' | 'growth' | 'scale' | 'coinDenomination';

const BASE_STEPS: StepId[] = ['element', 'crosses', 'growth', 'scale'];

/**
 * StructuralQuestionnaire — Recopilación de contexto estructural previa al análisis.
 *
 * Realiza preguntas de opción múltiple sobre el elemento donde se ubica la grieta.
 * Este contexto alimenta el motor de reglas estructurales para ponderar el nivel de riesgo.
 *
 * La referencia de escala soporta: moneda colombiana, regla o cinta métrica, o mano.
  * Se eliminó la opción de "tarjeta" porque en una emergencia el usuario suele usar
  * la tarjeta que tenga a mano (bancaria o cédula), y esa foto viaja a proveedores
  * de IA externos y queda almacenada — un riesgo de exposición de datos
  * personales/de pago injustificado.
 *
 * Cero emojis: utiliza exclusivamente iconografía de Lucide React y tokens semánticos dark-first.
 */
export function StructuralQuestionnaire({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [context, setContext] = useState<Partial<StructuralContext>>({
    hasScaleReference: false,
    crossesFullSpan: false,
    recentGrowth: false,
  });

  const steps = useMemo<StepId[]>(
    () => (context.scaleReferenceType === 'coin' ? [...BASE_STEPS, 'coinDenomination'] : BASE_STEPS),
    [context.scaleReferenceType]
  );

  const finalize = (overrides: Partial<StructuralContext>) => {
    const finalContext: StructuralContext = {
      elementType: (context.elementType as StructuralContext['elementType']) || 'other',
      crossesFullSpan: context.crossesFullSpan ?? false,
      hasScaleReference: context.hasScaleReference ?? false,
      scaleReferenceType: context.scaleReferenceType ?? 'none',
      recentGrowth: context.recentGrowth ?? false,
      ...overrides,
    };
    onComplete(finalContext);
  };

  const handleAnswer = (value: unknown) => {
    const current = steps[step];

    switch (current) {
      case 'element':
        setContext((prev) => ({ ...prev, elementType: value as StructuralContext['elementType'] }));
        setStep(step + 1);
        return;

      case 'crosses':
        setContext((prev) => ({ ...prev, crossesFullSpan: value as boolean }));
        setStep(step + 1);
        return;

      case 'growth':
        setContext((prev) => ({ ...prev, recentGrowth: value as boolean }));
        setStep(step + 1);
        return;

      case 'scale': {
        const refType = value as NonNullable<StructuralContext['scaleReferenceType']>;
        const hasRef = refType !== 'none';

        if (refType === 'coin') {
          setContext((prev) => ({ ...prev, hasScaleReference: hasRef, scaleReferenceType: refType }));
          setStep(step + 1);
          return;
        }

        finalize({ hasScaleReference: hasRef, scaleReferenceType: refType, coinDenomination: undefined });
        return;
      }

      case 'coinDenomination': {
        const denom = value as StructuralContext['coinDenomination'];
        finalize({ scaleReferenceType: 'coin', hasScaleReference: true, coinDenomination: denom });
        return;
      }
    }
  };

  const currentQ = getStepConfig(steps[step]);
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="w-full flex flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-6 shadow-sm">
      {/* Barra de progreso de preguntas */}
      <div>
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span className="font-semibold font-mono tabular-nums text-text-primary">
            Pregunta {step + 1} de {steps.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[36px] inline-flex items-center text-xs font-semibold text-brand-accent hover:underline px-2 py-1"
          >
            Saltar todo
          </button>
        </div>
        <div
          className="h-2 w-full bg-surface-3 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del cuestionario"
        >
          <div
            className="h-full bg-brand-accent rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Pregunta */}
      <div className="text-center py-2">
        <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
          {currentQ.question}
        </h2>
        {currentQ.subtitle && (
          <p className="mt-1 text-xs sm:text-sm text-text-secondary">
            {currentQ.subtitle}
          </p>
        )}
      </div>

      {/* Opciones */}
      <div
        className={`grid gap-2.5 sm:gap-3 ${
          currentQ.options.length > 2
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {currentQ.options.map((opt) => {
          const OptionIcon = opt.Icon;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => handleAnswer(opt.value)}
              className="flex flex-col items-center justify-center gap-2 min-h-[76px] sm:min-h-[88px] p-3 rounded-xl border border-border-default bg-surface-2 hover:border-brand-accent hover:bg-surface-3 active:scale-[0.98] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <OptionIcon className="h-6 w-6 text-brand-accent shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-semibold text-text-primary text-center leading-snug">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Botón retroceder */}
      {step > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="w-full min-h-[44px] flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-text-muted hover:text-text-primary rounded-xl border border-border-subtle bg-surface-2 hover:bg-surface-3 transition-colors duration-150 active:scale-[0.98]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Pregunta anterior</span>
          </button>
        </div>
      )}
    </div>
  );
}

function getStepConfig(stepId: StepId): QuestionDef {
  switch (stepId) {
    case 'element':
      return {
        question: '¿En qué elemento está la grieta?',
        options: [
          { label: 'Columna', value: 'column', Icon: Building2 },
          { label: 'Viga', value: 'beam', Icon: Ruler },
          { label: 'Muro de carga', value: 'load-bearing-wall', Icon: Layers },
          { label: 'Muro divisorio', value: 'partition-wall', Icon: DoorClosed },
          { label: 'Placa / Techo', value: 'slab', Icon: Square },
          { label: 'Cimiento', value: 'foundation', Icon: HardHat },
          { label: 'No sé', value: 'other', Icon: HelpCircle },
        ],
      };

    case 'crosses':
      return {
        question: '¿La grieta cruza de lado a lado del elemento?',
        options: [
          { label: 'Sí, cruza completamente', value: true, Icon: MoveHorizontal },
          { label: 'No, es parcial', value: false, Icon: ArrowRight },
        ],
      };

    case 'growth':
      return {
        question: '¿La grieta creció después del último sismo?',
        options: [
          { label: 'Sí, es nueva o creció', value: true, Icon: TrendingUp },
          { label: 'No / No sé', value: false, Icon: MinusCircle },
        ],
      };

    case 'scale':
      return {
        question: '¿Pusiste un objeto de referencia junto a la grieta?',
        subtitle: '(moneda, regla o cinta métrica, o mano) para medir el tamaño real',
        options: [
          { label: 'Sí, una moneda', value: 'coin', Icon: Coins },
          { label: 'Sí, una regla o cinta', value: 'ruler', Icon: Ruler },
          { label: 'Sí, mi mano', value: 'hand', Icon: Hand },
          { label: 'No, ninguno', value: 'none', Icon: XCircle },
        ],
      };

    case 'coinDenomination':
      return {
        question: '¿Qué moneda colombiana usaste?',
        subtitle: 'Cada denominación tiene un diámetro oficial distinto; esto calibra la medición',
        options: [
          { label: '$100', value: 100, Icon: Coins },
          { label: '$200', value: 200, Icon: Coins },
          { label: '$500', value: 500, Icon: Coins },
          { label: '$1.000', value: 1000, Icon: Coins },
        ],
      };
  }
}
