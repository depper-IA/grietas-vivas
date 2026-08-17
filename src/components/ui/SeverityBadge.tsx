/**
 * SeverityBadge — Primitiva visual de severidad con 3 niveles.
 *
 * Combina tres modalidades de comunicacion:
 *   1. Hue de color (tripleta bg/fg/border en tokens semanticos)
 *   2. Icono Lucide (Leaf / AlertTriangle / AlertOctagon)
 *   3. Etiqueta en espanol (Leve / Moderado / Critico)
 *
 * Esto garantiza legibilidad bajo condiciones de campo: sol fuerte,
 * pantalla mojada o uso con guantes. Cumple WCAG AA (>= 4.5:1) en
 * sus pares bg/fg verificados en `tokens.test.ts`.
 *
 * Ref: spec `visual-redesign-core` (Severity Badge System).
 * Ref: design `SeverityBadgeProps`.
 */

import { Leaf, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { SeverityLevel } from '@/lib/ui/severity';

/** Tamanos disponibles para el badge. */
export type SeverityBadgeSize = 'sm' | 'md' | 'lg';

/** Props publicas del componente. */
export interface SeverityBadgeProps {
  /** Nivel de severidad a representar. */
  level: SeverityLevel;
  /** Tamano del badge; default 'md'. */
  size?: SeverityBadgeSize;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

interface LevelPresentation {
  /** Etiqueta visible y accesible (con tildes correctas). */
  readonly label: string;
  /** aria-label en espanol completo. */
  readonly ariaLabel: string;
  /** Clases de tokens (bg / fg / border). */
  readonly toneClasses: string;
  /** Icono Lucide a renderizar. */
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Tabla cerrada de presentaciones. Una sola fuente de verdad para
 * que no se desincronicen etiqueta, color y aria-label.
 */
const LEVEL_PRESENTATION: Record<SeverityLevel, LevelPresentation> = {
  minor: {
    label: 'Leve',
    ariaLabel: 'Severidad: Leve',
    toneClasses: 'bg-status-minor text-status-minor-fg border-status-minor-border',
    Icon: Leaf,
  },
  moderate: {
    label: 'Moderado',
    ariaLabel: 'Severidad: Moderado',
    toneClasses:
      'bg-status-moderate text-status-moderate-fg border-status-moderate-border',
    Icon: AlertTriangle,
  },
  critical: {
    label: 'Crítico',
    ariaLabel: 'Severidad: Crítico',
    toneClasses:
      'bg-status-critical text-status-critical-fg border-status-critical-border',
    Icon: AlertOctagon,
  },
};

interface SizePresentation {
  /** Padding x / y en clases Tailwind. */
  readonly container: string;
  /** Tamano del texto. */
  readonly text: string;
  /** Tamano del icono (clases w-* h-*). */
  readonly icon: string;
}

const SIZE_PRESENTATION: Record<SeverityBadgeSize, SizePresentation> = {
  sm: {
    container: 'px-1.5 py-0.5 gap-1',
    text: 'text-[10px]',
    icon: 'h-3 w-3',
  },
  md: {
    container: 'px-2.5 py-1 gap-1.5',
    text: 'text-xs',
    icon: 'h-3.5 w-3.5',
  },
  lg: {
    container: 'px-3 py-1.5 gap-2',
    text: 'text-sm',
    icon: 'h-4 w-4',
  },
};

/**
 * Renderiza un badge de severidad. Visible, accesible (role="status"
 * + aria-label explicito) y sin emojis por diseno.
 */
export function SeverityBadge({
  level,
  size = 'md',
  className = '',
}: SeverityBadgeProps) {
  const presentation = LEVEL_PRESENTATION[level];
  const sizing = SIZE_PRESENTATION[size];
  const { Icon } = presentation;

  return (
    <span
      role="status"
      aria-label={presentation.ariaLabel}
      className={[
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-wide',
        'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
        sizing.container,
        sizing.text,
        presentation.toneClasses,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        className={sizing.icon}
      />
      <span>{presentation.label}</span>
    </span>
  );
}