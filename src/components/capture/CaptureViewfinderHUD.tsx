/**
 * CaptureViewfinderHUD — Overlay sobre CameraViewfinder para captura guiada.
 *
 * Composicion publica que agrega al viewfinder:
 *   - Crosshair SVG (rule of thirds + crosshair central) a opacidad reducida.
 *   - Burbuja de nivelacion con burbuja que responde a pitch/roll y muestra
 *     "Nivelado" cuando los angulos estan dentro de +/- 3 grados.
 *   - Barra de escala de referencia (5 cm) para sizing durante captura.
 *   - Boton de linterna (torch) toggle on/off con iconos Lucide.
 *   - Boton de captura con maquina de estados (idle | capturing | processing)
 *     y animacion `animate-ring-pulse` durante capturing.
 *
 * Separacion de responsabilidades: CameraViewfinder owns MediaStream;
 * CaptureViewfinderHUD owns visual overlays. DeviceOrientation es manejado
 * por el caller (capture page) que pasa pitch/roll via props.
 *
 * El contenedor raiz tiene `pointer-events-none` para no bloquear el
 * video subyacente; los botones recuperan `pointer-events-auto` para ser
 * interactivos.
 *
 * Ref: spec `visual-redesign-core` (Capture Viewfinder HUD, Zero Emojis,
 *      Dark-First Tokens, Capture Button State Machine).
 * Ref: design `CaptureViewfinderHUDProps` (slice 4, work unit 4).
 */

import {
  Flashlight,
  Zap,
  Loader2,
  Ruler,
} from 'lucide-react';

export type CaptureState = 'idle' | 'capturing' | 'processing';

export interface CaptureViewfinderHUDProps {
  /** Estado actual de la maquina de captura. */
  captureState: CaptureState;
  /** Callback al pulsar el boton de captura. */
  onCapture: () => void;
  /** Callback al pulsar el boton de linterna. */
  onTorchToggle: () => void;
  /** Estado de la linterna (true = encendida). */
  torchOn: boolean;
  /** Angulo de pitch en grados (default 0). */
  pitch?: number;
  /** Angulo de roll en grados (default 0). */
  roll?: number;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

/** Umbral en grados para considerar la superficie nivelada. */
const LEVEL_TOLERANCE_DEGREES = 3;

/** Sensibilidad de la burbuja: pixeles por grado. */
const BUBBLE_PIXELS_PER_DEGREE = 1.5;

/** Offset maximo de la burbuja (para evitar que se salga del ring). */
const BUBBLE_MAX_OFFSET_PX = 22;

/** Tamano del ring de nivelacion. */
const LEVEL_RING_SIZE_PX = 64;

/**
 * Limita un valor al rango [-max, max].
 */
function clamp(value: number, max: number): number {
  if (value > max) return max;
  if (value < -max) return -max;
  return value;
}

/**
 * Devuelve el aria-label del boton de captura segun el estado.
 */
function getCaptureButtonLabel(state: CaptureState): string {
  if (state === 'capturing') return 'Capturando foto';
  if (state === 'processing') return 'Procesando captura';
  return 'Capturar foto';
}

/**
 * CaptureViewfinderHUD — overlay del viewfinder con HUD de captura.
 */
export function CaptureViewfinderHUD({
  captureState,
  onCapture,
  onTorchToggle,
  torchOn,
  pitch = 0,
  roll = 0,
  className = '',
}: CaptureViewfinderHUDProps) {
  const isLevel =
    Math.abs(pitch) <= LEVEL_TOLERANCE_DEGREES &&
    Math.abs(roll) <= LEVEL_TOLERANCE_DEGREES;

  const rollOffset = clamp(roll * BUBBLE_PIXELS_PER_DEGREE, BUBBLE_MAX_OFFSET_PX);
  const pitchOffset = clamp(pitch * BUBBLE_PIXELS_PER_DEGREE, BUBBLE_MAX_OFFSET_PX);

  const bubbleTransform = `translate(calc(-50% + ${rollOffset}px), calc(-50% + ${pitchOffset}px))`;

  const captureDisabled = captureState !== 'idle';

  return (
    <div
      data-testid="capture-hud"
      aria-label="Captura de foto"
      className={[
        'pointer-events-none absolute inset-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Crosshair / regla de los tercios */}
      <svg
        data-testid="crosshair"
        role="presentation"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Regla de los tercios (4 lineas) */}
        <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="white" strokeWidth="0.15" />
        <line x1="66.66" y1="0" x2="66.66" y2="100" stroke="white" strokeWidth="0.15" />
        <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="white" strokeWidth="0.15" />
        <line x1="0" y1="66.66" x2="100" y2="66.66" stroke="white" strokeWidth="0.15" />
        {/* Crosshair central (2 lineas) */}
        <line x1="50" y1="42" x2="50" y2="58" stroke="white" strokeWidth="0.3" />
        <line x1="42" y1="50" x2="58" y2="50" stroke="white" strokeWidth="0.3" />
      </svg>

      {/* Indicador de nivel (esquina superior izquierda) */}
      <div
        className="absolute left-4 top-4 flex flex-col items-center gap-1"
        aria-label="Indicador de nivelación"
      >
        <div
          className="relative rounded-full border-2 border-white/50 bg-black/50 backdrop-blur-sm"
          style={{
            width: `${LEVEL_RING_SIZE_PX}px`,
            height: `${LEVEL_RING_SIZE_PX}px`,
          }}
          aria-hidden="true"
        >
          <div
            data-testid="leveling-bubble"
            className={[
              'absolute left-1/2 top-1/2 h-3.5 w-3.5 rounded-full',
              'transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
              isLevel ? 'bg-status-minor' : 'bg-status-moderate',
            ].join(' ')}
            style={{
              transform: bubbleTransform,
            }}
          />
          {/* Punto central de referencia */}
          <div
            className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
            aria-hidden="true"
          />
        </div>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={[
            'rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm',
            isLevel
              ? 'border-status-minor-border bg-status-minor/80 text-status-minor-fg'
              : 'border-status-moderate-border bg-status-moderate/80 text-status-moderate-fg',
          ].join(' ')}
        >
          {isLevel ? 'Nivelado' : `${Math.round(pitch)}° / ${Math.round(roll)}°`}
        </span>
      </div>

      {/* Boton de linterna (torch toggle) */}
      <button
        data-testid="torch-toggle"
        type="button"
        onClick={onTorchToggle}
        aria-label={torchOn ? 'Apagar linterna' : 'Activar linterna'}
        aria-pressed={torchOn}
        className={[
          'pointer-events-auto absolute right-4 top-4',
          'flex h-12 w-12 items-center justify-center rounded-full',
          'border border-border-default bg-surface-1/80 text-text-primary backdrop-blur',
          'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'hover:border-border-strong hover:bg-surface-2',
          'focus:outline-none focus:ring-2 focus:ring-brand-accent',
          'active:scale-95',
        ].join(' ')}
      >
        {torchOn ? (
          <Zap className="h-6 w-6" aria-hidden="true" focusable="false" />
        ) : (
          <Flashlight className="h-6 w-6" aria-hidden="true" focusable="false" />
        )}
      </button>

      {/* Referencia de escala (esquina inferior izquierda) */}
      <div
        data-testid="scale-reference"
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 left-6 flex items-end gap-1.5 rounded-md border border-border-default bg-surface-1/80 px-2 py-1 text-xs text-text-primary backdrop-blur"
      >
        <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-mono tabular-nums">5 cm</span>
      </div>

      {/* Boton de captura con maquina de estados */}
      <button
        data-testid="hud-capture-button"
        type="button"
        onClick={onCapture}
        disabled={captureDisabled}
        aria-label={getCaptureButtonLabel(captureState)}
        className={[
          'pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2',
          'flex h-20 w-20 items-center justify-center rounded-full',
          'border-4 border-white bg-surface-1 shadow-lg',
          'transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'active:scale-95',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-black',
          captureState === 'capturing' ? 'animate-ring-pulse' : '',
        ].join(' ')}
      >
        {captureState === 'processing' ? (
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
              captureState === 'capturing'
                ? 'bg-status-moderate'
                : 'bg-status-critical',
              'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
            ].join(' ')}
          />
        )}
      </button>
    </div>
  );
}