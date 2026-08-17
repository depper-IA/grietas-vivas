/**
 * SeverityLevel — Vocabulario UI de severidad (3 niveles).
 *
 * Es un subconjunto y mapeo estable del tipo AI `RiskLevel` (4 niveles)
 * para evitar alarmismo en la UI y reducir ruido cognitivo en
 * condiciones de campo.
 *
 * Reglas de mapeo (definidas en el contrato):
 *   - 'low' | 'medium'  -> 'minor'
 *   - 'high'            -> 'moderate'
 *   - 'critical'        -> 'critical'
 *
 * El adaptador preserva el extremo critico (no hay downgrade AI critico -> UI)
 * pero colapsa los dos niveles inferiores para enfocar la atencion del operador.
 */

import type { RiskLevel } from '@/lib/ai/types';

/** Niveles de severidad visibles en la UI. */
export type SeverityLevel = 'minor' | 'moderate' | 'critical';

/** Lista cerrada de SeverityLevel para validacion. */
export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  'minor',
  'moderate',
  'critical',
] as const;

/**
 * Mapea un nivel de riesgo AI (4 niveles) al nivel de severidad UI (3 niveles).
 *
 * Comportamiento determinista y puro. La funcion no lanza para los 4 valores
 * validos de `RiskLevel`; cualquier otro input se trata defensivamente como
 * 'minor' para no bloquear renderizado de UI en datos parcialmente corruptos.
 */
export function mapRiskLevelToSeverity(risk: RiskLevel): SeverityLevel {
  if (risk === 'critical') return 'critical';
  if (risk === 'high') return 'moderate';
  return 'minor';
}