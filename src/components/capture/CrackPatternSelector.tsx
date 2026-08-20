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

import { useCallback, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
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
import { VisualPatternGuideModal } from './VisualPatternGuideModal';

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
  const [isGuideOpen, setIsGuideOpen] = useState(false);

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
    <div className="w-full space-y-3">
      {/* Boton para abrir la guia modal con fotos reales sin salir de la pagina */}
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2/60 border border-border-subtle">
        <p className="text-xs text-text-muted">
          ¿Dudas con el patrón? Compara con fotos reales:
        </p>
        <button
          type="button"
          onClick={() => setIsGuideOpen(true)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-brand-accent/40 bg-surface-1 px-3 py-1 text-xs font-semibold text-brand-accent hover:bg-surface-2 transition-colors shrink-0"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ver fotos de ejemplo</span>
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={[
          'w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3',
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
                'group relative flex min-h-[110px] items-start gap-3.5',
                'rounded-2xl border p-3.5 text-left transition-all duration-150',
                'focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0',
                selected
                  ? 'border-brand-accent bg-brand-accent/5 ring-2 ring-brand-accent shadow-sm'
                  : 'border-border-default bg-surface-2/60 hover:border-border-strong hover:bg-surface-2',
                'active:scale-[0.98]',
              ].join(' ')}
            >
              {/* Diagrama a la izquierda (dimension fija, nunca se deforma) */}
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-2 shadow-inner shrink-0 mt-0.5">
                <PatternDiagram pattern={pattern} />
              </div>

              {/* Contenido a la derecha (titulo + badge arriba, descripcion abajo) */}
              <div className="flex flex-1 flex-col justify-between gap-1.5 min-w-0 pr-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold leading-tight text-text-primary">
                    {meta.labelEs}
                  </h3>
                  <div className="shrink-0">
                    <SeverityBadge level={severity} size="sm" />
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-text-secondary">
                  {meta.guidanceEs}
                </p>
              </div>

              {/* Indicador de seleccion (esquina inferior derecha) */}
              <span
                aria-hidden="true"
                className={[
                  'absolute bottom-2.5 right-2.5 h-2.5 w-2.5 rounded-full transition-all',
                  selected ? 'bg-brand-accent ring-2 ring-white scale-110' : 'bg-transparent',
                ].join(' ')}
              />
            </button>
          );
        })}
      </div>

      <VisualPatternGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        selectedPattern={value}
        onSelect={onChange}
      />
    </div>
  );
}