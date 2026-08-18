/**
 * Tests del modulo de taxonomia de grietas y evaluacion de override de seguridad.
 *
 * Cubre Spec R1 (10 pattern enum), R2 (metadata), R3 (5 booleanos), R4 (override critico).
 * Diseno: src/lib/validation/crackTaxonomy.ts (pure functions + Zod schemas).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CRACK_PATTERN_VALUES,
  crackPatternSchema,
  type CrackPattern,
  dangerSignalsSchema,
  type DangerSignals,
  PATTERN_METADATA,
  evaluateSafetyOverride,
  evaluateEmergencyOffline,
  type TriageOutcomeLevel as TriageLevel,
} from './crackTaxonomy';

describe('crackPatternSchema (R1)', () => {
  it('expone exactamente 10 valores en el enum', () => {
    expect(CRACK_PATTERN_VALUES.length).toBe(10);
  });

  it.each([
    'hairline_cosmetic',
    'vertical_shrinkage',
    'horizontal_flexural',
    'diagonal_shear',
    'stepped_masonry',
    'reentrant_corner',
    'interface_wall_column',
    'interface_wall_beam',
    'structural_beam_column',
    'spalling_corrosion',
  ] as const)('acepta el valor valido %s', (value) => {
    expect(crackPatternSchema.safeParse(value).success).toBe(true);
  });

  it('rechaza el valor "crack_type_old" como patron invalido', () => {
    const result = crackPatternSchema.safeParse('crack_type_old');
    expect(result.success).toBe(false);
  });

  it('rechaza string vacio', () => {
    expect(crackPatternSchema.safeParse('').success).toBe(false);
  });

  it('rechaza numero', () => {
    expect(crackPatternSchema.safeParse(42).success).toBe(false);
  });

  it('rechaza undefined', () => {
    expect(crackPatternSchema.safeParse(undefined).success).toBe(false);
  });

  it('CRACK_PATTERN_VALUES no contiene duplicados', () => {
    const set = new Set(CRACK_PATTERN_VALUES);
    expect(set.size).toBe(CRACK_PATTERN_VALUES.length);
  });
});

describe('dangerSignalsSchema (R3)', () => {
  it('acepta un objeto con los 5 booleanos en true', () => {
    const allTrue: DangerSignals = {
      jammedDoorsWindows: true,
      unleveledFloors: true,
      tiltedElements: true,
      exposedRebarSpalling: true,
      throughWallXCracks: true,
    };
    expect(dangerSignalsSchema.safeParse(allTrue).success).toBe(true);
  });

  it('acepta un objeto con los 5 booleanos en false', () => {
    const allFalse: DangerSignals = {
      jammedDoorsWindows: false,
      unleveledFloors: false,
      tiltedElements: false,
      exposedRebarSpalling: false,
      throughWallXCracks: false,
    };
    const result = dangerSignalsSchema.safeParse(allFalse);
    expect(result.success).toBe(true);
  });

  it('acepta mezcla (jammedDoorsWindows true, throughWallXCracks true, resto false)', () => {
    const mixed = {
      jammedDoorsWindows: true,
      throughWallXCracks: true,
      unleveledFloors: false,
      tiltedElements: false,
      exposedRebarSpalling: false,
    };
    const result = dangerSignalsSchema.safeParse(mixed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jammedDoorsWindows).toBe(true);
      expect(result.data.throughWallXCracks).toBe(true);
      expect(result.data.unleveledFloors).toBe(false);
    }
  });

  it('rechaza campos faltantes', () => {
    expect(
      dangerSignalsSchema.safeParse({
        jammedDoorsWindows: true,
        unleveledFloors: false,
        tiltedElements: false,
        exposedRebarSpalling: false,
      }).success
    ).toBe(false);
  });

  it('rechaza valores no booleanos (strings)', () => {
    expect(
      dangerSignalsSchema.safeParse({
        jammedDoorsWindows: 'yes',
        unleveledFloors: false,
        tiltedElements: false,
        exposedRebarSpalling: false,
        throughWallXCracks: false,
      }).success
    ).toBe(false);
  });

  it('rechaza campos extra no definidos', () => {
    expect(
      dangerSignalsSchema.safeParse({
        jammedDoorsWindows: false,
        unleveledFloors: false,
        tiltedElements: false,
        exposedRebarSpalling: false,
        throughWallXCracks: false,
        extraneousField: true,
      }).success
    ).toBe(false);
  });
});

describe('PATTERN_METADATA (R2)', () => {
  it('cubre los 10 patrones del enum', () => {
    for (const value of CRACK_PATTERN_VALUES) {
      expect(PATTERN_METADATA[value]).toBeDefined();
    }
  });

  it.each(CRACK_PATTERN_VALUES)(
    '%s expone titulo en espanol, descripcion, riskBaseline y diagramIconId',
    (value: CrackPattern) => {
      const meta = PATTERN_METADATA[value];
      expect(typeof meta.labelEs).toBe('string');
      expect(meta.labelEs.length).toBeGreaterThan(0);
      expect(typeof meta.guidanceEs).toBe('string');
      expect(meta.guidanceEs.length).toBeGreaterThan(0);
      expect(meta.guidanceEs.length).toBeLessThanOrEqual(200);
      expect(['minor', 'moderate', 'critical']).toContain(meta.riskBaseline);
      expect(typeof meta.diagramIconId).toBe('string');
      expect(meta.diagramIconId.length).toBeGreaterThan(0);
    }
  );

  it('spalling_corrosion tiene riskBaseline = critical', () => {
    expect(PATTERN_METADATA.spalling_corrosion.riskBaseline).toBe('critical');
  });

  it('hairline_cosmetic tiene riskBaseline = minor', () => {
    expect(PATTERN_METADATA.hairline_cosmetic.riskBaseline).toBe('minor');
  });
});

describe('evaluateSafetyOverride (R4)', () => {
  const baseSignals: DangerSignals = {
    jammedDoorsWindows: false,
    unleveledFloors: false,
    tiltedElements: false,
    exposedRebarSpalling: false,
    throughWallXCracks: false,
  };

  it('exposedRebarSpalling:true -> safetyOverride=true (critico)', () => {
    const signals: DangerSignals = {
      ...baseSignals,
      exposedRebarSpalling: true,
    };
    const result = evaluateSafetyOverride(
      'hairline_cosmetic',
      signals,
      'low'
    );
    expect(result.safetyOverride).toBe(true);
    expect(result.level).toBe('evacuate_emergency');
  });

  it('throughWallXCracks:true -> safetyOverride=true (critico)', () => {
    const signals: DangerSignals = {
      ...baseSignals,
      throughWallXCracks: true,
    };
    const result = evaluateSafetyOverride(
      'horizontal_flexural',
      signals,
      'medium'
    );
    expect(result.safetyOverride).toBe(true);
    expect(result.level).toBe('evacuate_emergency');
  });

  it('diagonal_shear + jammedDoorsWindows:true -> safetyOverride=true', () => {
    const signals: DangerSignals = {
      ...baseSignals,
      jammedDoorsWindows: true,
    };
    const result = evaluateSafetyOverride(
      'diagonal_shear',
      signals,
      'medium'
    );
    expect(result.safetyOverride).toBe(true);
    expect(result.level).toBe('evacuate_emergency');
  });

  it('spalling_corrosion (cualquier severity) -> safetyOverride=true', () => {
    const result = evaluateSafetyOverride(
      'spalling_corrosion',
      baseSignals,
      'low'
    );
    expect(result.safetyOverride).toBe(true);
    expect(result.level).toBe('evacuate_emergency');
  });

  it('jammedDoorsWindows:true sin pattern diagonal_shear no fuerza override por si solo', () => {
    const signals: DangerSignals = {
      ...baseSignals,
      jammedDoorsWindows: true,
    };
    const result = evaluateSafetyOverride(
      'hairline_cosmetic',
      signals,
      'low'
    );
    expect(result.safetyOverride).toBe(false);
  });

  it('sin senales peligrosas y patron benigno -> nivel baseline bajo', () => {
    const result = evaluateSafetyOverride(
      'hairline_cosmetic',
      baseSignals,
      'low'
    );
    expect(result.safetyOverride).toBe(false);
    expect(result.level).toBe('habitable');
  });

  it('resultado siempre expone las 4 claves del contrato', () => {
    const result = evaluateSafetyOverride(
      'vertical_shrinkage',
      baseSignals,
      'medium'
    );
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('labelEs');
    expect(result).toHaveProperty('actionEs');
    expect(result).toHaveProperty('safetyOverride');
  });

  it('labelEs esta en espanol y coincide con R8 (Habitable/Monitoreo/No Habitar/Evacuacion)', () => {
    // Baseline (sin senales disparadoras):
    //   low -> Habitable
    //   medium -> Habitable (severidad moderada sin override no es monitoreo)
    //   high -> Monitoreo Requerido
    //   critical -> No Habitar
    // Evacuacion Inmediata solo cuando hay override de seguridad (R4).
    const baseline = evaluateSafetyOverride(
      'hairline_cosmetic',
      baseSignals,
      'low'
    ).labelEs;
    const baselineMedium = evaluateSafetyOverride(
      'vertical_shrinkage',
      baseSignals,
      'medium'
    ).labelEs;
    const baselineHigh = evaluateSafetyOverride(
      'horizontal_flexural',
      baseSignals,
      'high'
    ).labelEs;
    const baselineCritical = evaluateSafetyOverride(
      'stepped_masonry',
      baseSignals,
      'critical'
    ).labelEs;
    expect(baseline).toBe('Habitable');
    expect(baselineMedium).toBe('Habitable');
    expect(baselineHigh).toBe('Monitoreo Requerido');
    expect(baselineCritical).toBe('No Habitar');

    // Override (senales peligrosas disparan evacuacion de inmediato):
    const overrideLabel = evaluateSafetyOverride(
      'hairline_cosmetic',
      { ...baseSignals, exposedRebarSpalling: true },
      'low'
    ).labelEs;
    expect(overrideLabel).toBe('Evacuacion Inmediata');
  });

  it('actionEs no vacio y <=300 chars', () => {
    const result = evaluateSafetyOverride(
      'hairline_cosmetic',
      baseSignals,
      'low'
    );
    expect(result.actionEs.length).toBeGreaterThan(0);
    expect(result.actionEs.length).toBeLessThanOrEqual(300);
  });

  it('baseline severity low->habitable, medium->habitable, high->monitoring, critical->unsafe', () => {
    expect(
      evaluateSafetyOverride('hairline_cosmetic', baseSignals, 'low').level
    ).toBe('habitable');
    expect(
      evaluateSafetyOverride('vertical_shrinkage', baseSignals, 'medium').level
    ).toBe('habitable');
    expect(
      evaluateSafetyOverride('horizontal_flexural', baseSignals, 'high').level
    ).toBe('monitoring_required');
    expect(
      evaluateSafetyOverride('stepped_masonry', baseSignals, 'critical').level
    ).toBe('unsafe_no_entry');
  });

  it('critical AI severity sin override explicito fuerza unsafe_no_entry', () => {
    const result = evaluateSafetyOverride(
      'reentrant_corner',
      baseSignals,
      'critical'
    );
    expect(result.level).toBe('unsafe_no_entry');
    expect(result.safetyOverride).toBe(false);
  });
});

describe('evaluateSafetyOverride — invariantes property-based', () => {
  const allPatterns = fc.constantFrom(...CRACK_PATTERN_VALUES);
  const allRiskLevels = fc.constantFrom('low', 'medium', 'high', 'critical');
  const dangerSignalsArb = fc.record({
    jammedDoorsWindows: fc.boolean(),
    unleveledFloors: fc.boolean(),
    tiltedElements: fc.boolean(),
    exposedRebarSpalling: fc.boolean(),
    throughWallXCracks: fc.boolean(),
  });

  it('1000 entradas aleatorias: level siempre pertenece a TriageLevel', () => {
    fc.assert(
      fc.property(allPatterns, allRiskLevels, dangerSignalsArb, (p, r, s) => {
        const out = evaluateSafetyOverride(p, s, r);
        const validLevels: readonly TriageLevel[] = [
          'habitable',
          'monitoring_required',
          'unsafe_no_entry',
          'evacuate_emergency',
        ];
        return validLevels.includes(out.level);
      }),
      { numRuns: 1000 }
    );
  });

  it('1000 entradas: safetyOverride=true <-> level=evacuate_emergency', () => {
    fc.assert(
      fc.property(allPatterns, allRiskLevels, dangerSignalsArb, (p, r, s) => {
        const out = evaluateSafetyOverride(p, s, r);
        return out.safetyOverride === (out.level === 'evacuate_emergency');
      }),
      { numRuns: 1000 }
    );
  });

  it('1000 entradas: labelEs y actionEs no vacios en espanol', () => {
    fc.assert(
      fc.property(allPatterns, allRiskLevels, dangerSignalsArb, (p, r, s) => {
        const out = evaluateSafetyOverride(p, s, r);
        return (
          out.labelEs.length > 0 &&
          out.actionEs.length > 0 &&
          /^[A-Za-z\xc3\xa1\xc3\xa9\xc3\xad\xc3\xb3\xc3\xba\xc3\xb1 ]+$/.test(
            out.labelEs
          )
        );
      }),
      { numRuns: 1000 }
    );
  });

  it('1000 entradas: spalling_corrosion SIEMPRE produce safetyOverride=true', () => {
    fc.assert(
      fc.property(allRiskLevels, dangerSignalsArb, (r, s) => {
        const out = evaluateSafetyOverride('spalling_corrosion', s, r);
        return out.safetyOverride === true && out.level === 'evacuate_emergency';
      }),
      { numRuns: 1000 }
    );
  });
});

describe('evaluateEmergencyOffline (Motor Heurístico Local NSR-10 / FEMA 306)', () => {
  const baseContext = {
    elementType: 'column' as const,
    crossesFullSpan: false,
    hasScaleReference: false,
    recentGrowth: false,
  };

  const safeSignals: DangerSignals = {
    jammedDoorsWindows: false,
    unleveledFloors: false,
    tiltedElements: false,
    exposedRebarSpalling: false,
    throughWallXCracks: false,
  };

  it('evalua a crítico cuando hay varilla expuesta', () => {
    const result = evaluateEmergencyOffline(
      baseContext,
      'hairline_cosmetic',
      { ...safeSignals, exposedRebarSpalling: true }
    );
    expect(result.riskLevel).toBe('critical');
    expect(result.provider).toBe('Motor Heurístico NSR-10 (Offline)');
    expect(result.description).toContain('Patrón:');
  });

  it('evalua a crítico para corte diagonal o nudo en columnas', () => {
    const resultCol = evaluateEmergencyOffline(
      { ...baseContext, elementType: 'column' },
      'diagonal_shear',
      safeSignals
    );
    expect(resultCol.riskLevel).toBe('critical');

    const resultBeam = evaluateEmergencyOffline(
      { ...baseContext, elementType: 'beam' },
      'structural_beam_column',
      safeSignals
    );
    expect(resultBeam.riskLevel).toBe('critical');
  });

  it('evalua a bajo para grieta capilar en muro divisorio', () => {
    const result = evaluateEmergencyOffline(
      { ...baseContext, elementType: 'partition-wall' },
      'hairline_cosmetic',
      safeSignals
    );
    expect(result.riskLevel).toBe('low');
  });

  it('incrementa severidad ante crecimiento reciente post-sismo', () => {
    const beforeGrowth = evaluateEmergencyOffline(
      { ...baseContext, elementType: 'partition-wall', recentGrowth: false },
      'hairline_cosmetic',
      safeSignals
    );
    expect(beforeGrowth.riskLevel).toBe('low');

    const afterGrowth = evaluateEmergencyOffline(
      { ...baseContext, elementType: 'partition-wall', recentGrowth: true },
      'hairline_cosmetic',
      safeSignals
    );
    expect(afterGrowth.riskLevel).toBe('medium');
  });
});
