/**
 * Emergency Engine — Offline Deterministic Structural Damage Triage
 *
 * Implements rule-based structural triage grounded directly in NSR-10 (Colombia)
 * and FEMA 306 standards for use when network connectivity is unavailable.
 *
 * Guaranteed invariants:
 * - 100% deterministic (pure function, no external API calls)
 * - Strict 4-line description format in Spanish
 * - Marked with offline origin badge
 * - Fixed confidence: 0.95
 * - Provider: 'emergency-offline-engine'
 */

import type { AnalysisResult, RiskLevel } from './types';
import type { StructuralContext } from './structuralPrompt';
import type { CrackPattern, DangerSignals } from '@/lib/validation/crackTaxonomy';

const ELEMENT_LABELS: Record<StructuralContext['elementType'], string> = {
  'column': 'Columna estructural',
  'beam': 'Viga estructural',
  'load-bearing-wall': 'Muro de carga / portante',
  'partition-wall': 'Muro divisorio / tabique no estructural',
  'slab': 'Losa de entrepiso / techo',
  'foundation': 'Elemento de cimentación',
  'other': 'Elemento constructivo no determinado',
};

const PATTERN_LABELS: Record<CrackPattern, string> = {
  hairline_cosmetic: 'Grieta Capilar Cosmética (<0.3 mm)',
  vertical_shrinkage: 'Grieta Vertical por Retracción / Fraguado',
  horizontal_flexural: 'Grieta Horizontal por Flexión',
  diagonal_shear: 'Grieta Diagonal por Cortante Sísmico',
  stepped_masonry: 'Grieta Escalonada en Juntas de Mampostería',
  reentrant_corner: 'Grieta en Esquina Reentrante de Vano (Puerta/Ventana)',
  interface_wall_column: 'Separación en Junta Muro-Columna',
  interface_wall_beam: 'Separación en Junta Muro-Viga',
  structural_beam_column: 'Daño en Nudo Rígido Viga-Columna',
  spalling_corrosion: 'Desprendimiento (Spalling) con Acero de Refuerzo Expuesto',
};

/**
 * Evaluates structural damage offline using deterministic NSR-10 / FEMA 306 rules.
 *
 * @param context Structural context (element type, span traversal, growth, floor)
 * @param pattern Detected or user-selected crack pattern
 * @param signals Observed immediate danger signals
 * @returns Fully populated and validated AnalysisResult
 */
export function evaluateEmergencyOffline(
  context: StructuralContext,
  pattern: CrackPattern,
  signals: DangerSignals,
): AnalysisResult {
  const isStructuralElement = ['column', 'beam', 'foundation', 'load-bearing-wall', 'slab'].includes(
    context.elementType,
  );
  const isMainFrameElement = ['column', 'beam', 'foundation'].includes(context.elementType);

  let riskLevel: RiskLevel;
  let patternSummary = PATTERN_LABELS[pattern] || pattern;
  let severityReason = '';
  let recommendation = '';

  // 1. CRITICAL CONDITIONS (Immediate danger / evacuation)
  if (
    signals.exposedRebarSpalling ||
    signals.throughWallXCracks ||
    signals.tiltedElements ||
    pattern === 'spalling_corrosion' ||
    pattern === 'structural_beam_column' ||
    (pattern === 'diagonal_shear' && (signals.jammedDoorsWindows || isMainFrameElement)) ||
    (isMainFrameElement && (context.crossesFullSpan || pattern === 'diagonal_shear'))
  ) {
    riskLevel = 'critical';

    const criticalFactors: string[] = [];
    if (signals.exposedRebarSpalling || pattern === 'spalling_corrosion') {
      criticalFactors.push('acero de refuerzo expuesto o pandeado');
    }
    if (signals.throughWallXCracks) {
      criticalFactors.push('grietas pasantes en "X" por cortante sísmico bidireccional');
    }
    if (signals.tiltedElements) {
      criticalFactors.push('desplome o inclinación de elementos');
    }
    if (pattern === 'structural_beam_column') {
      criticalFactors.push('daño severo en nudo viga-columna');
    }
    if (pattern === 'diagonal_shear' && isMainFrameElement) {
      criticalFactors.push('falla por cortante diagonal en elemento estructural principal');
    }
    if (pattern === 'diagonal_shear' && signals.jammedDoorsWindows) {
      criticalFactors.push('cortante diagonal con distorsión de vanos/marcos trabados');
    }
    if (isMainFrameElement && context.crossesFullSpan) {
      criticalFactors.push('grieta que atraviesa toda la sección del elemento principal');
    }

    const factorText = criticalFactors.length > 0 ? criticalFactors.join(', ') : 'compromiso severo de estabilidad';
    severityReason = `Riesgo inminente de colapso local o global según NSR-10 debido a ${factorText}.`;
    recommendation = 'EVACUAR INMEDIATAMENTE. Cortar suministros de gas/agua, no usar ascensor y reportar a la línea de emergencias 123.';
  }
  // 2. HIGH RISK CONDITIONS (Serious structural damage / access restricted)
  else if (
    (context.elementType === 'load-bearing-wall' &&
      (context.crossesFullSpan ||
        pattern === 'diagonal_shear' ||
        pattern === 'horizontal_flexural' ||
        pattern === 'stepped_masonry')) ||
    isMainFrameElement ||
    signals.unleveledFloors ||
    signals.jammedDoorsWindows ||
    (context.recentGrowth && isStructuralElement) ||
    pattern === 'diagonal_shear'
  ) {
    riskLevel = 'high';

    const highFactors: string[] = [];
    if (context.elementType === 'load-bearing-wall' && context.crossesFullSpan) {
      highFactors.push('muro de carga con grieta que cruza toda la sección');
    } else if (context.elementType === 'load-bearing-wall' && pattern === 'diagonal_shear') {
      highFactors.push('muro de carga con cortante diagonal activo');
    } else if (isMainFrameElement) {
      highFactors.push('fisuración en elemento estructural principal');
    } else if (signals.unleveledFloors) {
      highFactors.push('desnivel perceptible en pisos por asentamiento o distorsión');
    } else if (signals.jammedDoorsWindows) {
      highFactors.push('marcos trabados por redistribución de esfuerzos');
    } else if (context.recentGrowth) {
      highFactors.push('progresión y crecimiento activo post-sismo');
    } else {
      highFactors.push('grieta diagonal con potencial compromiso portante');
    }

    severityReason = `Daño estructural significativo según NSR-10/FEMA 306 por ${highFactors.join(', ')}.`;
    recommendation = 'NO HABITAR EL ÁREA AFECTADA. Restringir el paso y solicitar inspección técnica prioritaria por un ingeniero civil o perito calificado.';
  }
  // 3. MEDIUM RISK CONDITIONS (Moderate non-structural or interface damage)
  else if (
    pattern === 'reentrant_corner' ||
    pattern === 'interface_wall_column' ||
    pattern === 'interface_wall_beam' ||
    pattern === 'stepped_masonry' ||
    pattern === 'horizontal_flexural' ||
    (context.elementType === 'partition-wall' && context.recentGrowth)
  ) {
    riskLevel = 'medium';
    severityReason = 'Daño moderado en elementos secundarios o juntas de dilatación/concentración de esfuerzos sin compromiso evidente de la estructura principal.';
    recommendation = 'Monitorear la evolución de la grieta en las próximas 72 horas. Registrar cambios de apertura y programar evaluación técnica.';
  }
  // 4. LOW RISK CONDITIONS (Cosmetic / superficial)
  else {
    riskLevel = 'low';
    if (pattern === 'hairline_cosmetic') {
      patternSummary = 'Fisura Capilar Cosmética (<0.3 mm)';
    }
    severityReason = 'Fisura superficial o de retracción en acabados/revoque. No compromete la estabilidad estructural ni la seguridad del inmueble.';
    recommendation = 'Inmueble habitable. Reparación estética estándar mediante masilla o pintura cuando sea conveniente.';
  }

  // Build Location line
  const locationParts: string[] = [ELEMENT_LABELS[context.elementType] || context.elementType];
  if (context.crackFloor != null) {
    locationParts.push(`piso ${context.crackFloor}`);
  }
  if (context.buildingFloors != null) {
    locationParts.push(`edificación de ${context.buildingFloors} pisos`);
  }
  const locationLine = locationParts.join(', ');

  // Assemble 4-line description with offline engine banner
  const descriptionLines = [
    `Patrón: ${patternSummary}`,
    `Ubicación: ${locationLine}`,
    `Severidad: ${severityReason}`,
    `Recomendación: ${recommendation}`,
    '',
    '[Triaje generado por el Motor de Emergencia Local (Sin Conexión)]',
  ];

  const fullDescription = descriptionLines.join('\n');

  return {
    riskLevel,
    description: fullDescription.length > 2000 ? fullDescription.slice(0, 2000) : fullDescription,
    confidence: 0.95,
    provider: 'emergency-offline-engine',
    analyzedAt: new Date().toISOString(),
  };
}
