'use client';

/**
 * AnalysisLoadingScreen — Dynamic loading screen during AI structural analysis.
 *
 * Rotates through contextual messages to keep the user engaged while the AI
 * processes photos. Messages reflect actual analysis steps (pattern matching,
 * risk calibration, regulatory comparison, etc.) rather than generic "loading".
 *
 * Uses a progress simulation (not real progress) tied to typical analysis
 * duration (~8-15s) to give the user a sense of advancement.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ScanSearch, Shield, Ruler, FileCheck, Layers } from 'lucide-react';

interface AnalysisStep {
  icon: typeof Brain;
  title: string;
  subtitle: string;
}

const ANALYSIS_STEPS: AnalysisStep[] = [
  {
    icon: ScanSearch,
    title: 'Detectando patrones de grieta',
    subtitle: 'Clasificando tipo: diagonal, horizontal, escalera...',
  },
  {
    icon: Ruler,
    title: 'Calibrando escala',
    subtitle: 'Midiendo ancho y profundidad con la referencia visual',
  },
  {
    icon: Layers,
    title: 'Evaluando elemento estructural',
    subtitle: 'Identificando columna, viga, muro o losa afectada',
  },
  {
    icon: Brain,
    title: 'Aplicando matriz NSR-10 / FEMA 306',
    subtitle: 'Comparando con base de datos de daño sismico real',
  },
  {
    icon: Shield,
    title: 'Calculando nivel de riesgo',
    subtitle: 'Ponderando patron + ubicacion + progresion',
  },
  {
    icon: FileCheck,
    title: 'Generando reporte forense',
    subtitle: 'Preparando hallazgos y recomendaciones...',
  },
];

/** Time between step transitions in ms */
const STEP_INTERVAL = 3000;

/** Maximum time before forcing a timeout callback (45s) */
const MAX_ANALYSIS_TIME_MS = 45_000;

interface AnalysisLoadingScreenProps {
  /** Called when analysis exceeds the maximum expected time */
  onTimeout?: () => void;
}

export function AnalysisLoadingScreen({ onTimeout }: AnalysisLoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  // Rotate through steps
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, STEP_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Simulate progress bar (reaches ~92% then slows down)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev + 0.1;
        if (prev >= 75) return prev + 0.3;
        if (prev >= 50) return prev + 0.8;
        return prev + 1.5;
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Safety timeout — if analysis takes too long, notify parent
  useEffect(() => {
    if (!onTimeout) return;
    const timer = setTimeout(onTimeout, MAX_ANALYSIS_TIME_MS);
    return () => clearTimeout(timer);
  }, [onTimeout]);

  const step = ANALYSIS_STEPS[currentStep];
  const StepIcon = step.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Analizando imagen con inteligencia artificial"
      className="my-auto flex flex-col items-center justify-center rounded-2xl border border-border-default bg-surface-1 p-6 sm:p-8 text-center shadow-lg overflow-hidden"
    >
      {/* Animated icon */}
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-brand-accent/10 animate-ping" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/15 border border-brand-accent/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
              transition={{ duration: 0.3 }}
            >
              <StepIcon className="h-7 w-7 text-brand-accent" aria-hidden="true" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Dynamic text */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="min-h-[56px] flex flex-col items-center justify-center"
        >
          <h2 className="text-sm font-bold text-text-primary sm:text-base">
            {step.title}
          </h2>
          <p className="mt-1 max-w-xs text-xs text-text-secondary leading-relaxed">
            {step.subtitle}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Progress bar */}
      <div className="mt-5 w-full max-w-xs">
        <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand-cta"
            initial={{ width: '0%' }}
            animate={{ width: `${Math.min(progress, 95)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Paso {currentStep + 1} de {ANALYSIS_STEPS.length}
        </p>
      </div>

      {/* Reassurance footer */}
      <p className="mt-4 text-[10px] text-text-muted max-w-[280px] leading-relaxed">
        Tu foto se procesa cifrada y no se almacena en servidores externos
      </p>
    </div>
  );
}
