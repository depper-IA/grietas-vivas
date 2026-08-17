/**
 * CrackPatternSelector — Selector visual de patron de grieta (Spec R1, R2).
 *
 * Grilla responsive de 10 tarjetas con titulo en espanol, descripcion,
 * diagrama SVG inline y SeverityBadge de riesgo baseline. Accesible via
 * role="radiogroup" + role="radio", tap target >= 44px.
 *
 * Cero emojis: SVG + SeverityBadge + tokens. Diagramas en
 * `crackPatternDiagrams.ts`.
 *
 * Ref: spec seismic-triage-upgrade R1, R2; design Slice 2 (Phase 2).
 */

'use client';

import { useCallback, useMemo } from 'react';
import {
  CRACK_PATTERN_VALUES,
  PATTERN_METADATA,
  type CrackPattern,
} from '@/lib/validation/crackTaxonomy';
import type { SeverityLevel } from '@/lib/ui/severity';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import {
  CRACK_DIAGRAMS,
  CRACK_DIAGRAM_VIEWBOX,
} from './crackPatternDiagrams';

export interface CrackPatternSelectorProps {
  /** Patron actualmente seleccionado (o null). */
  value: CrackPattern | null;
  /** Callback invocado al seleccionar una opcion. */
  onChange: (pattern: CrackPattern) => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
  /** aria-label custom para el radiogroup (override). */
  ariaLabel?: string;
}

/** aria-label por defecto en espanol. */
const DEFAULT_ARIA_LABEL = 'Selector de patron de grieta';

/**
 * Mapea el `riskBaseline` (minor | moderate | critical) del patron a
 * `SeverityLevel` que SeverityBadge entiende.
 */
function baselineToSeverity(
  baseline: 'minor' | 'moderate' | 'critical'
): SeverityLevel {
  return baseline;
}

/**
 * Renderiza el diagrama SVG inline del patron. El componente padre
 * puede aplicar color via `currentColor` (clases Tailwind).
 */
function PatternDiagram({ pattern }: { pattern: CrackPattern }) {
  const diagram = CRACK_DIAGRAMS[pattern];
  return (
    <svg
      data-testid={`crack-diagram-${pattern}`}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      viewBox={CRACK_DIAGRAM_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      className="h-10 w-10 text-text-secondary"
    >
      {diagram.paths.map((p, i) => (
        <path
          key={`${pattern}-p-${i}`}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke="currentColor"
          strokeWidth={p.strokeWidth ?? 0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/**
 * CrackPatternSelector — Componente publico.
 */
export function CrackPatternSelector({
  value,
  onChange,
  className = '',
  ariaLabel = DEFAULT_ARIA_LABEL,
}: CrackPatternSelectorProps) {
  const cards = useMemo(
    () => CRACK_PATTERN_VALUES.map((p) => ({ pattern: p, meta: PATTERN_METADATA[p] })),
    []
  );

  const handleSelect = useCallback(
    (pattern: CrackPattern) => () => {
      onChange(pattern);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (pattern: CrackPattern) =>
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onChange(pattern);
        }
      },
    [onChange]
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        'w-full',
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {cards.map(({ pattern, meta }) => {
        const selected = value === pattern;
        const severity = baselineToSeverity(meta.riskBaseline);
        return (
          <button
            key={pattern}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${meta.labelEs} — riesgo ${meta.riskBaseline}`}
            tabIndex={selected || value === null ? 0 : -1}
            data-testid={`crack-pattern-${pattern}`}
            data-pattern={pattern}
            onClick={handleSelect(pattern)}
            onKeyDown={handleKeyDown(pattern)}
            className={[
              'group relative flex min-h-[140px] flex-col items-stretch gap-2',
              'rounded-xl border p-3 text-left transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0',
              selected
                ? 'border-brand-accent bg-surface-2 shadow-[0_0_0_1px_var(--brand-accent)]'
                : 'border-border-default bg-surface-1 hover:border-border-strong hover:bg-surface-2',
              'active:scale-[0.98]',
            ].join(' ')}
          >
            {/* Diagrama + badge (header) */}
            <div className="flex items-start justify-between gap-2">
              <div className="rounded-md border border-border-subtle bg-surface-2 p-1.5">
                <PatternDiagram pattern={pattern} />
              </div>
              <SeverityBadge level={severity} size="sm" />
            </div>

            {/* Titulo */}
            <h3 className="text-sm font-semibold leading-tight text-text-primary">
              {meta.labelEs}
            </h3>

            {/* Guidance */}
            <p className="text-xs leading-snug text-text-muted">
              {meta.guidanceEs}
            </p>

            {/* Indicador de seleccion (esquina inferior) */}
            <span
              aria-hidden="true"
              className={[
                'absolute bottom-2 right-2 h-2 w-2 rounded-full',
                selected ? 'bg-brand-accent' : 'bg-transparent',
              ].join(' ')}
            />
          </button>
        );
      })}
    </div>
  );
}