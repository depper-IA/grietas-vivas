/**
 * DangerSignalsChecklist — Checklist de 5 senales de peligro inmediato
 * (Spec R3, R4 de seismic-triage-upgrade).
 *
 * Configuracion estatica de las senales en `dangerSignals.constants.ts`.
 * Cero emojis: solo Lucide + tokens. Tap target >= 44px.
 * Ref: spec R3 (5 booleanos), R4 (override); design Slice 2 (Phase 2).
 */

'use client';

import { useCallback, useMemo } from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import type { DangerSignals } from '@/lib/validation/crackTaxonomy';
import { DANGER_SIGNAL_DEFS, type DangerSignalDef } from './dangerSignals.constants';

export interface DangerSignalsChecklistProps {
  /** Estado actual de las 5 senales. */
  value: DangerSignals;
  /** Callback al cambiar cualquier toggle (recibe el objeto completo). */
  onChange: (signals: DangerSignals) => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

const DEFAULT_ARIA_LABEL = 'Checklist de senales de peligro estructural';

function CriticalBanner() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="danger-critical-banner"
      className="flex items-start gap-3 rounded-xl border border-status-critical-border bg-status-critical/15 p-3 text-text-primary sm:p-4"
    >
      <AlertOctagon
        className="h-5 w-5 shrink-0 text-status-critical-fg"
        aria-hidden="true"
        focusable="false"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold leading-tight">
          Peligro Estructural Detectado
        </p>
        <p className="text-xs leading-snug text-text-secondary">
          Senales criticas activas. Evacua el area, corta gas y agua, y
          contacta a la linea de emergencias 123 de inmediato.
        </p>
      </div>
    </div>
  );
}

function SignalCard({
  def,
  active,
  onToggle,
}: {
  def: DangerSignalDef;
  active: boolean;
  onToggle: () => void;
}) {
  const { Icon } = def;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-label={`${def.labelEs}: ${active ? 'activo' : 'inactivo'}`}
      data-testid={`danger-signal-${def.field}`}
      data-field={def.field}
      data-active={active ? 'true' : 'false'}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={[
        'group flex min-h-[64px] items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 sm:p-4',
        'focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0',
        'active:scale-[0.98]',
        active
          ? 'border-status-critical-border bg-status-critical/10'
          : 'border-border-default bg-surface-1 hover:border-border-strong hover:bg-surface-2',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
          active
            ? 'border-status-critical-border bg-status-critical/20 text-status-critical-fg'
            : 'border-border-subtle bg-surface-2 text-brand-accent',
        ].join(' ')}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" aria-hidden="true" focusable="false" />
      </span>

      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold leading-tight text-text-primary">
          {def.labelEs}
        </span>
        <span className="text-xs leading-snug text-text-muted">
          {def.descriptionEs}
        </span>
      </div>

      <span
        aria-hidden="true"
        className={[
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
          active
            ? 'border-status-critical-border bg-status-critical text-status-critical-fg'
            : 'border-border-strong bg-surface-2',
        ].join(' ')}
      >
        {active && (
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            aria-hidden="true"
          >
            <path d="M3 8.5 L7 12 L13 4" />
          </svg>
        )}
      </span>
    </button>
  );
}

export function DangerSignalsChecklist({
  value,
  onChange,
  className = '',
}: DangerSignalsChecklistProps) {
  const handleToggle = useCallback(
    (field: keyof DangerSignals) => () => {
      onChange({ ...value, [field]: !value[field] });
    },
    [onChange, value]
  );

  const criticalActive = useMemo(
    () =>
      DANGER_SIGNAL_DEFS.some(
        (def) => def.isCriticalTrigger && value[def.field] === true
      ),
    [value]
  );

  return (
    <div
      role="group"
      aria-label={DEFAULT_ARIA_LABEL}
      className={['flex w-full flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      {criticalActive && <CriticalBanner />}

      <div className="flex flex-col gap-2 sm:gap-3">
        {DANGER_SIGNAL_DEFS.map((def) => (
          <SignalCard
            key={def.field}
            def={def}
            active={value[def.field]}
            onToggle={handleToggle(def.field)}
          />
        ))}
      </div>

      {!criticalActive && (
        <p
          className="mt-1 flex items-center gap-2 text-xs leading-snug text-text-muted"
          aria-live="polite"
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
            focusable="false"
          />
          <span>
            Activa las senales que observes. Las marcadas como criticas
            disparan alerta de evacuacion inmediata.
          </span>
        </p>
      )}
    </div>
  );
}