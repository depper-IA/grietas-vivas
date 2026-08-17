/**
 * Tests para el adaptador RiskLevel -> SeverityLevel.
 *
 * Contrato:
 *   - 'low'      -> 'minor'
 *   - 'medium'   -> 'minor'
 *   - 'high'     -> 'moderate'
 *   - 'critical' -> 'critical'
 *
 * El mapeo preserva la jerarquia: 'critical' AI se mantiene como
 * 'critical' UI, 'high' se reduce a 'moderate' para evitar alarmismo,
 * y 'low'/'medium' colapsan en 'minor' para reducir ruido cognitivo.
 */

import { describe, it, expect } from 'vitest';
import {
  mapRiskLevelToSeverity,
  type SeverityLevel,
} from './severity';

describe('mapRiskLevelToSeverity', () => {
  const cases: Array<{
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    expected: SeverityLevel;
  }> = [
    { riskLevel: 'low', expected: 'minor' },
    { riskLevel: 'medium', expected: 'minor' },
    { riskLevel: 'high', expected: 'moderate' },
    { riskLevel: 'critical', expected: 'critical' },
  ];

  it.each(cases)(
    "mapea '$riskLevel' a '$expected'",
    ({ riskLevel, expected }) => {
      expect(mapRiskLevelToSeverity(riskLevel)).toBe(expected);
    }
  );

  it('cubre los 4 valores de RiskLevel (cobertura completa)', () => {
    const inputs: Array<'low' | 'medium' | 'high' | 'critical'> = [
      'low',
      'medium',
      'high',
      'critical',
    ];
    const outputs = inputs.map(mapRiskLevelToSeverity);
    expect(outputs).toHaveLength(4);
    expect(new Set(outputs)).toEqual(new Set(['minor', 'moderate', 'critical']));
  });

  it('resultado siempre es un SeverityLevel valido', () => {
    const valid: SeverityLevel[] = ['minor', 'moderate', 'critical'];
    const inputs: Array<'low' | 'medium' | 'high' | 'critical'> = [
      'low',
      'medium',
      'high',
      'critical',
    ];
    for (const input of inputs) {
      expect(valid).toContain(mapRiskLevelToSeverity(input));
    }
  });

  it('"critical" AI se preserva como "critical" UI (sin downgrade)', () => {
    expect(mapRiskLevelToSeverity('critical')).toBe('critical');
  });

  it('"high" AI colapsa a "moderate" UI (reduce alarma)', () => {
    expect(mapRiskLevelToSeverity('high')).toBe('moderate');
  });

  it('"low" y "medium" colapsan a "minor" UI (reduce ruido)', () => {
    expect(mapRiskLevelToSeverity('low')).toBe('minor');
    expect(mapRiskLevelToSeverity('medium')).toBe('minor');
  });
});