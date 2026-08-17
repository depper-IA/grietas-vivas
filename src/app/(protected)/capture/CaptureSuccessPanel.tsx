/**
 * CaptureSuccessPanel — Panel de exito post-analisis con guia de triaje
 * (Slice 4 de seismic-triage-upgrade).
 *
 * Se renderiza despues de que el reporte se sincroniza exitosamente con
 * Supabase. Combina:
 *   - PostTriageActionGuide (4-tier banner + Llamar 123 + checklist)
 *   - Link al reporte completo
 *   - Boton "Nueva Captura" para iniciar un nuevo flujo
 *   - (Opcional) contexto estructural si viene del flujo legacy
 *
 * Es presentacional: solo props + callbacks. El estado vive en
 * `capture/page.tsx`. Aplicar `evaluateSafetyOverride` para garantizar
 * pisos de seguridad cuando senales criticas o patron lo indique.
 *
 * Cero emojis: SVG Lucide + tokens semanticos dark-first.
 */

import { Camera, FileText } from 'lucide-react';
import { PostTriageActionGuide } from '@/components/reports/PostTriageActionGuide';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import type { TriageOutcome } from '@/lib/validation/schemas';
import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
import type { RiskLevel } from '@/lib/ai/types';

export interface CaptureSuccessPanelProps {
  /** Triage outcome (computed via evaluateSafetyOverride). */
  outcome: TriageOutcome;
  /** Nivel de riesgo AI original (4 niveles) — usado para SeverityBadge. */
  aiRiskLevel: RiskLevel;
  /** Confianza AI entre 0 y 1. */
  confidence: number;
  /** Proveedor AI que genero el analisis. */
  provider: string;
  /** Descripcion humana del analisis. */
  description: string;
  /** ReportId asignado por Supabase tras la sincronizacion. */
  reportId: string | null;
  /** Callback para iniciar una nueva captura. */
  onNewCapture: () => void;
  /** Clases Tailwind adicionales. */
  className?: string;
}

/**
 * CaptureSuccessPanel — Panel de exito con guia de triaje.
 *
 * Estructura:
 *   [PostTriageActionGuide] banner 4-tier
 *   [SeverityBadge] + confianza + proveedor
 *   [Link al reporte completo] si reportId presente
 *   [Boton Nueva Captura]
 */
export function CaptureSuccessPanel({
  outcome,
  aiRiskLevel,
  confidence,
  provider,
  description,
  reportId,
  onNewCapture,
  className = '',
}: CaptureSuccessPanelProps) {
  const severity = mapRiskLevelToSeverity(aiRiskLevel);

  return (
    <div
      className={[
        'flex w-full flex-col gap-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Guia de triaje 4-tier (R8, R9) */}
      <PostTriageActionGuide outcome={outcome} />

      {/* Resumen del analisis AI */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border-default bg-surface-1 p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <SeverityBadge level={severity} size="md" />
          <span className="font-mono tabular-nums text-xs text-text-muted">
            Confianza: {Math.round(confidence * 100)}%
          </span>
        </div>
        <p className="text-sm leading-snug text-text-secondary">
          {description}
        </p>
        <p className="text-xs text-text-muted">Proveedor: {provider}</p>
      </div>

      {/* Link al reporte completo */}
      {reportId && (
        <a
          href={`/reports/${reportId}`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-status-minor-border bg-status-minor px-4 py-3 text-sm font-semibold text-status-minor-fg shadow-sm transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-minor-border focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <FileText
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
            focusable="false"
          />
          <span>Ver Reporte Completo</span>
        </a>
      )}

      {/* Nueva captura */}
      <button
        type="button"
        onClick={onNewCapture}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-3 text-base font-semibold text-surface-0 shadow-lg shadow-brand-accent/20 transition-all duration-150 active:scale-[0.98] hover:bg-brand-accent/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
      >
        <Camera className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false" />
        <span>Nueva Captura</span>
      </button>
    </div>
  );
}
