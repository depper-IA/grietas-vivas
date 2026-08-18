'use client';

import { useState } from 'react';
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
  CreditCard,
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

interface QuestionDef<T> {
  question: string;
  subtitle?: string;
  field: keyof StructuralContext;
  options: OptionItem<T>[];
}

/**
 * StructuralQuestionnaire — Recopilación de contexto estructural previa al análisis.
 *
 * Realiza preguntas de opción múltiple sobre el elemento donde se ubica la grieta.
 * Este contexto alimenta el motor de reglas estructurales para ponderar el nivel de riesgo.
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

  const questions: [
    QuestionDef<StructuralContext['elementType']>,
    QuestionDef<boolean>,
    QuestionDef<boolean>,
    QuestionDef<StructuralContext['scaleReferenceType']>
  ] = [
    // Paso 0: Tipo de elemento
    {
      question: '¿En qué elemento está la grieta?',
      field: 'elementType',
      options: [
        { label: 'Columna', value: 'column', Icon: Building2 },
        { label: 'Viga', value: 'beam', Icon: Ruler },
        { label: 'Muro de carga', value: 'load-bearing-wall', Icon: Layers },
        { label: 'Muro divisorio', value: 'partition-wall', Icon: DoorClosed },
        { label: 'Placa / Techo', value: 'slab', Icon: Square },
        { label: 'Cimiento', value: 'foundation', Icon: HardHat },
        { label: 'No sé', value: 'other', Icon: HelpCircle },
      ],
    },
    // Paso 1: Cruza el elemento completo
    {
      question: '¿La grieta cruza de lado a lado del elemento?',
      field: 'crossesFullSpan',
      options: [
        { label: 'Sí, cruza completamente', value: true, Icon: MoveHorizontal },
        { label: 'No, es parcial', value: false, Icon: ArrowRight },
      ],
    },
    // Paso 2: Crecimiento reciente post-sismo
    {
      question: '¿La grieta creció después del último sismo?',
      field: 'recentGrowth',
      options: [
        { label: 'Sí, es nueva o creció', value: true, Icon: TrendingUp },
        { label: 'No / No sé', value: false, Icon: MinusCircle },
      ],
    },
    // Paso 3: Referencia de escala para dimensionamiento
    {
      question: '¿Pusiste un objeto de referencia junto a la grieta?',
      subtitle: '(moneda, tarjeta, mano) para medir el tamaño real',
      field: 'scaleReferenceType',
      options: [
        { label: 'Sí, una moneda', value: 'coin', Icon: Coins },
        { label: 'Sí, una tarjeta', value: 'card', Icon: CreditCard },
        { label: 'Sí, mi mano', value: 'hand', Icon: Hand },
        { label: 'No, ninguno', value: 'none', Icon: XCircle },
      ],
    },
  ];

  const handleAnswer = (value: unknown) => {
    const currentQ = questions[step];

    if (currentQ.field === 'scaleReferenceType') {
      const hasRef = value !== 'none';
      setContext((prev) => ({
        ...prev,
        hasScaleReference: hasRef,
        scaleReferenceType: value as StructuralContext['scaleReferenceType'],
      }));
    } else {
      setContext((prev) => ({ ...prev, [currentQ.field]: value }));
    }

    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      // Completar cuestionario
      const finalContext: StructuralContext = {
        elementType: (context.elementType as StructuralContext['elementType']) || 'other',
        crossesFullSpan: context.crossesFullSpan ?? false,
        hasScaleReference: value !== 'none',
        scaleReferenceType: value !== 'none' ? (value as StructuralContext['scaleReferenceType']) : 'none',
        recentGrowth: context.recentGrowth ?? false,
      };
      onComplete(finalContext);
    }
  };

  const currentQ = questions[step];
  const progress = ((step + 1) / questions.length) * 100;

  return (
    <div className="w-full flex flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-6 shadow-sm">
      {/* Barra de progreso de preguntas */}
      <div>
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span className="font-semibold font-mono tabular-nums text-text-primary">
            Pregunta {step + 1} de {questions.length}
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
