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

import { Camera, FileText, Key, Settings2 } from 'lucide-react';
import { PostTriageActionGuide } from '@/components/reports/PostTriageActionGuide';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { FormattedAnalysisText } from '@/components/reports/FormattedAnalysisText';
import { MotionButton } from '@/components/ui/MotionButton';
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
 *   [Aviso Offline -> CTA a Configuración] si se usó el motor local
 *   [Link al reporte completo] si reportId presente
 *   [Boton Nueva Captura]
 */
export function CaptureSuccessPanel({
  outcome,
  aiRiskLevel,
  confidence,
  description,
  reportId,
  onNewCapture,
  className = '',
}: CaptureSuccessPanelProps) {
  const severity = mapRiskLevelToSeverity(aiRiskLevel);
  const isOfflineFallback = description.includes('[Triaje Offline');

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

      {/* Aviso educativo y accion directa si fallo el fallback de IA en la nube */}
      {isOfflineFallback && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm">
          <div className="flex items-start gap-2.5">
            <Settings2 className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-950">
                Servidor de IA no disponible (Triaje local de emergencia)
              </h3>
              <p className="mt-0.5 text-xs text-amber-900 leading-relaxed">
                Los servidores públicos no respondieron y se generó un triaje de emergencia. Para obtener informes detallados con IA sin depender de servidores compartidos, conecta tu propia clave API.
              </p>
            </div>
          </div>
          <a
            href="/settings?reason=fallback_failed"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-800 active:scale-[0.98] transition-all"
          >
            <Key className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Configurar mi propia API (BYOK) para continuar</span>
          </a>
        </div>
      )}

      {/* Resumen del analisis AI */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-gradient-to-br from-surface-1 to-surface-2 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <SeverityBadge level={severity} size="md" />
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono tabular-nums text-base font-semibold text-text-primary">
              {Math.round(confidence * 100)}%
            </span>
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              confianza
            </span>
          </div>
        </div>
        <FormattedAnalysisText text={description} />
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
      <MotionButton
        type="button"
        onClick={onNewCapture}
        buttonProps={{
          className:
            'flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-brand-cta px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand-cta/20 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0',
        }}
      >
        <Camera className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false" />
        <span>Nueva Captura</span>
      </MotionButton>
    </div>
  );
}
