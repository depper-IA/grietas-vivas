/**
 * PostTriageActionGuide — Banner y guia post-triaje para el ciudadano
 * (Spec R8, R9 de seismic-triage-upgrade).
 *
 * Renderiza cuatro niveles visuales segun `TriageOutcome`:
 *   - habitable            -> triage-habitable (verde, reinspeccion 72h)
 *   - monitoring_required  -> triage-monitoring (ambar, inspeccion 7d)
 *   - unsafe_no_entry      -> triage-unsafe (naranja, no habitar)
 *   - evacuate_emergency   -> triage-evacuate (rojo, evacuar + 123)
 *
 * Incluye:
 *   - Boton "Llamar 123" (anchor tel:) en triage-unsafe/evacuate
 *     usando NEXT_PUBLIC_EMERGENCY_NUMBER (default '123').
 *   - Checklist pre-evacuacion con 5 items canonicos
 *     (Gas / Agua / Electricidad / No Ascensores / Zonas Comunes)
 *     visible en niveles unsafe/evacuate via acordeon.
 *   - Boton "Entendido" opcional que invoca onDismiss cuando se
 *     provee (para que el caller pueda ocultar el banner).
 *
 * Cero emojis: SVG Lucide + tokens semanticos. ARIA alert en
 * safetyOverride=true. Tap targets >= 44px.
 *
 * Ref: spec R8 (banner 4-tier), R9 (checklist + 123 anchor).
 * Ref: design Slice 3 (Phase 3) de seismic-triage-upgrade.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Flame,
  Lightbulb,
  Phone,
  ShieldAlert,
  Users,
  Droplets,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { TriageOutcome } from '@/lib/validation/crackTaxonomy';

export interface PostTriageActionGuideProps {
  /** Resultado del motor de evaluacion post-triaje (R4 + R8). */
  outcome: TriageOutcome;
  /** Callback opcional al pulsar "Entendido". Si se omite, no se renderiza el boton. */
  onDismiss?: () => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

/** Numero de emergencia local. Default Colombia 123. */
const DEFAULT_EMERGENCY_NUMBER =
  (typeof process !== 'undefined' &&
    process.env?.NEXT_PUBLIC_EMERGENCY_NUMBER) ||
  '123';

interface ChecklistItem {
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly titleEs: string;
  readonly descriptionEs: string;
}

/**
 * 5 acciones canonicas del protocolo pre-evacuacion (R9). Mantenidas
 * en orden estable para que cualquier consumidor pueda iterar.
 */
const PRE_EVACUATION_CHECKLIST: readonly ChecklistItem[] = [
  {
    Icon: Flame,
    titleEs: 'Corta el gas',
    descriptionEs: 'Cierra la llave de paso del gas inmediatamente.',
  },
  {
    Icon: Droplets,
    titleEs: 'Cierra el agua',
    descriptionEs: 'Cierra la llave principal de agua para evitar fugas.',
  },
  {
    Icon: Lightbulb,
    titleEs: 'Desconecta la electricidad',
    descriptionEs: 'Baja el interruptor general antes de salir.',
  },
  {
    Icon: ShieldAlert,
    titleEs: 'No uses ascensores',
    descriptionEs: 'Utiliza solo las escaleras para evacuar.',
  },
  {
    Icon: Users,
    titleEs: 'Dirigete a zonas comunes',
    descriptionEs: 'Reunate en el punto de encuentro del edificio o area abierta.',
  },
];

interface LevelPresentation {
  readonly ariaRole: 'status' | 'alert';
  readonly ariaLive: 'polite' | 'assertive';
  readonly toneClasses: string;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Mapeo nivel de triage -> presentacion visual y semantica. */
const LEVEL_PRESENTATION: Record<TriageOutcome['level'], LevelPresentation> = {
  habitable: {
    ariaRole: 'status',
    ariaLive: 'polite',
    toneClasses:
      'border-triage-habitable-border bg-triage-habitable text-triage-habitable-fg',
    Icon: CheckCircle2,
  },
  monitoring_required: {
    ariaRole: 'status',
    ariaLive: 'polite',
    toneClasses:
      'border-triage-monitoring-border bg-triage-monitoring text-triage-monitoring-fg',
    Icon: AlertTriangle,
  },
  unsafe_no_entry: {
    ariaRole: 'alert',
    ariaLive: 'assertive',
    toneClasses:
      'border-triage-unsafe-border bg-triage-unsafe text-triage-unsafe-fg',
    Icon: AlertOctagon,
  },
  evacuate_emergency: {
    ariaRole: 'alert',
    ariaLive: 'assertive',
    toneClasses:
      'border-triage-evacuate-border bg-triage-evacuate text-triage-evacuate-fg',
    Icon: AlertOctagon,
  },
};

/** Niveles de triage donde se enfatiza la accion de emergencia. */
const CRITICAL_LEVELS: ReadonlySet<TriageOutcome['level']> = new Set<TriageOutcome['level']>([
  'unsafe_no_entry',
  'evacuate_emergency',
]);

/**
 * PostTriageActionGuide — Componente publico.
 */
export function PostTriageActionGuide({
  outcome,
  onDismiss,
  className = '',
}: PostTriageActionGuideProps) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  const presentation = LEVEL_PRESENTATION[outcome.level];
  const { Icon } = presentation;
  const isCritical = CRITICAL_LEVELS.has(outcome.level);

  const toggleChecklist = useCallback(() => {
    setChecklistOpen((prev) => !prev);
  }, []);

  const telHref = useMemo(() => `tel:${DEFAULT_EMERGENCY_NUMBER}`, []);

  return (
    <section
      role="region"
      aria-label="Guia post-triaje"
      className={['flex w-full flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      {/* Banner principal */}
      <div
        data-testid="triage-banner"
        role={presentation.ariaRole}
        aria-live={presentation.ariaLive}
        aria-atomic="true"
        className={[
          'flex items-start gap-3 rounded-2xl border-2 p-4 shadow-md sm:p-5',
          presentation.toneClasses,
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-0/20"
        >
          <Icon className="h-6 w-6" aria-hidden="true" focusable="false" />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-lg font-bold leading-tight sm:text-xl">
            {outcome.labelEs}
          </h2>
          <p className="text-sm leading-snug sm:text-base">{outcome.actionEs}</p>

          {/* Safety override badge */}
          {outcome.safetyOverride && (
            <p
              data-testid="triage-safety-override"
              className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-current/30 bg-surface-0/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            >
              Override de seguridad activo
            </p>
          )}
        </div>
      </div>

      {/* Boton de llamada (solo en niveles criticos) */}
      {isCritical && (
        <a
          href={telHref}
          aria-label={`Llamar a la linea de emergencias ${DEFAULT_EMERGENCY_NUMBER}`}
          data-testid="emergency-call-button"
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border-2 border-triage-evacuate-border bg-triage-evacuate px-4 py-3 text-base font-bold text-triage-evacuate-fg shadow-sm transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-triage-evacuate-border focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <Phone className="h-5 w-5" aria-hidden="true" focusable="false" />
          <span>Llamar {DEFAULT_EMERGENCY_NUMBER}</span>
        </a>
      )}

      {/* Checklist pre-evacuacion (solo en niveles criticos) */}
      {isCritical && (
        <>
          <button
            type="button"
            data-testid="pre-evacuation-checklist-toggle"
            onClick={toggleChecklist}
            aria-expanded={checklistOpen}
            aria-controls="pre-evacuation-checklist-panel"
            className="flex min-h-[56px] items-center justify-between gap-2 rounded-xl border border-border-default bg-surface-2 px-4 py-3 text-left text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
          >
            <span className="flex items-center gap-2">
              <ShieldAlert
                className="h-4 w-4 text-triage-unsafe"
                aria-hidden="true"
                focusable="false"
              />
              <span>Checklist: antes de evacuar</span>
            </span>
            <ChevronDown
              className={[
                'h-5 w-5 shrink-0 transition-transform duration-150',
                checklistOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden="true"
              focusable="false"
            />
          </button>

          {checklistOpen && (
            <div
              id="pre-evacuation-checklist-panel"
              data-testid="pre-evacuation-checklist"
              role="region"
              aria-label="Checklist pre-evacuacion"
              className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-1 p-3 sm:p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Protocolo inicial de seguridad
              </p>
              <ol className="flex flex-col gap-2">
                {PRE_EVACUATION_CHECKLIST.map((item, idx) => {
                  const ItemIcon = item.Icon;
                  return (
                    <li
                      key={item.titleEs}
                      className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-2 p-3"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-1 text-brand-accent"
                      >
                        <ItemIcon className="h-4 w-4" aria-hidden="true" focusable="false" />
                      </span>
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-semibold text-text-primary">
                          {idx + 1}. {item.titleEs}
                        </span>
                        <span className="text-xs leading-snug text-text-secondary">
                          {item.descriptionEs}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </>
      )}

      {/* Boton "Entendido" opcional */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Entendido: cerrar guia"
          className="flex min-h-[48px] items-center justify-center rounded-xl border border-border-default bg-surface-2 px-4 py-3 text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          Entendido
        </button>
      )}
    </section>
  );
}