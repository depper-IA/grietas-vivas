/**
 * RiskBadge — DEPRECATED: usar `SeverityBadge` en su lugar.
 *
 * Wrapper de compatibilidad que delega en `SeverityBadge` (slice 2)
 * para mantener el contrato visual existente mientras se completa la
 * migracion al vocabulario UI de 3 niveles (Leve / Moderado / Critico).
 *
 * Mantiene la API publica previa (`level: RiskLevel`) para no romper
 * consumidores externos durante el ciclo de deprecacion. La traduccion
 * de 4 niveles AI a 3 niveles UI se hace con `mapRiskLevelToSeverity`.
 *
 * @deprecated desde slice 3. Reemplazar por SeverityBadge directo:
 *
 * ```tsx
 * import { SeverityBadge } from '@/components/ui/SeverityBadge';
 * import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
 *
 * <SeverityBadge level={mapRiskLevelToSeverity(report.riskLevel)} />
 * ```
 *
 * Sera eliminado en un proximo corte. Ver changelog de `visual-redesign-core`.
 *
 * Ref: spec `visual-redesign-core` (Severity Badge System).
 */

import type { RiskLevel } from '@/lib/ai/types';
import { mapRiskLevelToSeverity } from '@/lib/ui/severity';
import { SeverityBadge } from '@/components/ui/SeverityBadge';

interface RiskBadgeProps {
  level: RiskLevel;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * @deprecated Usar `SeverityBadge` directamente.
 */
export function RiskBadge({ level, className }: RiskBadgeProps) {
  const severity = mapRiskLevelToSeverity(level);
  return <SeverityBadge level={severity} className={className} />;
}
