/**
 * CaptureButton — Boton principal de captura con maquina de estados.
 *
 * Acepta un prop `state` que controla el render visual:
 *   - idle       : circulo rojo, clickable
 *   - capturing  : circulo amarillo, deshabilitado, aria-label "Capturando"
 *   - processing : spinner Loader2, deshabilitado, aria-label "Procesando"
 *
 * Mantiene compatibilidad con la API previa (onCapture + disabled + isCapturing)
 * via props opcionales con defaults.
 *
 * Ref: spec `visual-redesign-core` (Capture Button State Machine).
 * Ref: design `CaptureButton` (slice 4, work unit 4).
 */

import { Loader2 } from 'lucide-react';

export type CaptureState = 'idle' | 'capturing' | 'processing';

export interface CaptureButtonProps {
  /** Triggered when user taps capture. */
  onCapture: () => void;
  /** Disable button during capture processing. */
  disabled?: boolean;
  /** Legacy: alias for state='capturing'. */
  isCapturing?: boolean;
  /** Maquina de estados: idle | capturing | processing. */
  state?: CaptureState;
  /** Clases Tailwind adicionales. */
  className?: string;
}

/**
 * Resuelve el estado efectivo a partir de props legacy + state.
 */
function resolveState(state: CaptureState | undefined, isCapturing: boolean): CaptureState {
  if (state) return state;
  return isCapturing ? 'capturing' : 'idle';
}

/**
 * Devuelve el aria-label segun el estado.
 */
function getLabel(state: CaptureState): string {
  if (state === 'capturing') return 'Capturando foto';
  if (state === 'processing') return 'Procesando captura';
  return 'Capturar foto';
}

/**
 * CaptureButton — boton grande y prominente para captura de foto.
 * Mobile-first: tap target >= 80px (w-20 h-20).
 */
export function CaptureButton({
  onCapture,
  disabled = false,
  isCapturing = false,
  state,
  className = '',
}: CaptureButtonProps) {
  const effectiveState = resolveState(state, isCapturing);
  const isDisabled = disabled || effectiveState !== 'idle';

  return (
    <button
      type="button"
      onClick={onCapture}
      disabled={isDisabled}
      aria-label={getLabel(effectiveState)}
      className={[
        'relative flex h-20 w-20 items-center justify-center rounded-full',
        'border-4 border-white bg-surface-1 shadow-lg',
        'transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'active:scale-95',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-black',
        effectiveState === 'capturing' ? 'animate-ring-pulse' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {effectiveState === 'processing' ? (
        <Loader2
          className="h-8 w-8 animate-spin text-brand-accent"
          aria-hidden="true"
          focusable="false"
        />
      ) : (
        <span
          aria-hidden="true"
          className={[
            'block h-14 w-14 rounded-full',
            effectiveState === 'capturing'
              ? 'bg-status-moderate'
              : 'bg-status-critical',
            'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
          ].join(' ')}
        />
      )}
    </button>
  );
}