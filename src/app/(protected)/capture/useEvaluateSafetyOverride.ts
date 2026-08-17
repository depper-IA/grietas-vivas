/**
 * useEvaluateSafetyOverride — Hook que aplica el override de seguridad
 * (Spec R4, R8 de seismic-triage-upgrade) y devuelve un TriageOutcome.
 *
 * Reglas de override (R4) — siempre elevate a evacuate_emergency:
 *   - exposedRebarSpalling === true
 *   - throughWallXCracks === true
 *   - patron === 'spalling_corrosion'
 *   - patron === 'diagonal_shear' AND jammedDoorsWindows === true
 *
 * Cuando NO se dispara override, el nivel de triage se mapea desde la
 * severidad AI (critical -> unsafe_no_entry, high -> monitoring_required,
 * low/medium -> habitable). Si no hay resultado AI todavia, se usa
 * 'low' como baseline conservador para que el panel pos-triage
 * siempre presente la conclusion mas cauta posible.
 *
 * Pure composition: la logica vive en `evaluateSafetyOverride` (modulo
 * `crackTaxonomy`). Este hook solo coordina cuando hay entradas
 * suficientes para evaluar.
 */

import { useMemo } from 'react';
import {
  evaluateSafetyOverride,
  type CrackPattern,
  type DangerSignals,
  type TriageOutcome,
  type AIRiskLevel,
} from '@/lib/validation/schemas';

export interface UseEvaluateSafetyOverrideArgs {
  pattern: CrackPattern | null;
  dangerSignals: DangerSignals | null;
  /** Severidad AI del analisis. Si no se provee, usa 'low' como baseline. */
  aiRiskLevel?: AIRiskLevel | null;
}

export interface UseEvaluateSafetyOverrideResult {
  /** Triage outcome listo para PostTriageActionGuide. null si no aplica. */
  outcome: TriageOutcome | null;
  /** True cuando hay patron y senales suficientes para evaluar. */
  ready: boolean;
}

/**
 * Hook publico que calcula el TriageOutcome. Es un thin wrapper
 * memorizado sobre `evaluateSafetyOverride`.
 */
export function useEvaluateSafetyOverride(
  pattern: CrackPattern | null,
  dangerSignals: DangerSignals | null,
  aiRiskLevel?: AIRiskLevel | null
): TriageOutcome | null {
  return useMemo(() => {
    if (!pattern || !dangerSignals) return null;
    const severity: AIRiskLevel = aiRiskLevel ?? 'low';
    return evaluateSafetyOverride(pattern, dangerSignals, severity);
  }, [pattern, dangerSignals, aiRiskLevel]);
}
