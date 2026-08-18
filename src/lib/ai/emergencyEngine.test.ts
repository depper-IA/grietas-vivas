/**
 * Emergency Engine — Unit Tests
 *
 * Tests the deterministic offline structural damage classification engine
 * according to NSR-10 (Colombia) and FEMA 306 standards.
 */

import { describe, it, expect } from 'vitest';
import { evaluateEmergencyOffline } from './emergencyEngine';
import type { StructuralContext } from './structuralPrompt';
import type { CrackPattern, DangerSignals } from '@/lib/validation/crackTaxonomy';
import { analysisResultSchema } from '@/lib/validation/schemas';

const BASE_CONTEXT: StructuralContext = {
  elementType: 'partition-wall',
  crossesFullSpan: false,
  hasScaleReference: false,
  recentGrowth: false,
};

const NO_SIGNALS: DangerSignals = {
  jammedDoorsWindows: false,
  unleveledFloors: false,
  tiltedElements: false,
  exposedRebarSpalling: false,
  throughWallXCracks: false,
};

describe('EmergencyEngine — evaluateEmergencyOffline', () => {
  describe('Invariants & Output Contract', () => {
    it('returns a valid AnalysisResult conforming to schema', () => {
      const result = evaluateEmergencyOffline(
        BASE_CONTEXT,
        'hairline_cosmetic',
        NO_SIGNALS,
      );

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.provider).toBe('emergency-offline-engine');
      expect(result.confidence).toBe(0.95);
      expect(typeof result.analyzedAt).toBe('string');
      expect(new Date(result.analyzedAt).toISOString()).toBe(result.analyzedAt);
    });

    it('formats description in 4 lines plus offline engine badge in Spanish', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall', crackFloor: 2 },
        'diagonal_shear',
        NO_SIGNALS,
      );

      expect(result.description).toContain('Patrón:');
      expect(result.description).toContain('Ubicación:');
      expect(result.description).toContain('Severidad:');
      expect(result.description).toContain('Recomendación:');
      expect(result.description).toContain('[Triaje generado por el Motor de Emergencia Local (Sin Conexión)]');
      expect(result.description.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('Critical Damage Conditions (riskLevel: "critical")', () => {
    it('classifies as critical when exposedRebarSpalling signal is true', () => {
      const result = evaluateEmergencyOffline(
        BASE_CONTEXT,
        'hairline_cosmetic',
        { ...NO_SIGNALS, exposedRebarSpalling: true },
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
      expect(result.description).toContain('acero de refuerzo expuesto');
    });

    it('classifies as critical when throughWallXCracks signal is true', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall' },
        'stepped_masonry',
        { ...NO_SIGNALS, throughWallXCracks: true },
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
      expect(result.description).toContain('cortante sísmico bidireccional');
    });

    it('classifies as critical when tiltedElements signal is true', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'column' },
        'vertical_shrinkage',
        { ...NO_SIGNALS, tiltedElements: true },
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
      expect(result.description).toContain('desplome o inclinación');
    });

    it('classifies as critical when pattern is spalling_corrosion', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'column' },
        'spalling_corrosion',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
    });

    it('classifies as critical when pattern is structural_beam_column', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'beam' },
        'structural_beam_column',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
      expect(result.description).toContain('nudo viga-columna');
    });

    it('classifies as critical when diagonal_shear occurs with jammedDoorsWindows', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall' },
        'diagonal_shear',
        { ...NO_SIGNALS, jammedDoorsWindows: true },
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('EVACUAR INMEDIATAMENTE');
    });

    it('classifies as critical when diagonal_shear is on column or beam', () => {
      const resultColumn = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'column' },
        'diagonal_shear',
        NO_SIGNALS,
      );
      expect(resultColumn.riskLevel).toBe('critical');

      const resultBeam = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'beam' },
        'diagonal_shear',
        NO_SIGNALS,
      );
      expect(resultBeam.riskLevel).toBe('critical');
    });

    it('classifies as critical when column or beam crosses full span', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'column', crossesFullSpan: true },
        'horizontal_flexural',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('atraviesa toda la sección');
    });
  });

  describe('High Damage Conditions (riskLevel: "high")', () => {
    it('classifies load-bearing wall with crossesFullSpan as high', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall', crossesFullSpan: true },
        'vertical_shrinkage',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('high');
      expect(result.description).toContain('NO HABITAR');
    });

    it('classifies load-bearing wall with diagonal_shear as high (when no critical signals)', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall' },
        'diagonal_shear',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('high');
      expect(result.description).toContain('NO HABITAR');
    });

    it('classifies unleveledFloors as high risk', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'partition-wall' },
        'stepped_masonry',
        { ...NO_SIGNALS, unleveledFloors: true },
      );

      expect(result.riskLevel).toBe('high');
      expect(result.description).toContain('desnivel perceptible en pisos');
    });

    it('classifies recentGrowth on structural elements as high', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'load-bearing-wall', recentGrowth: true },
        'stepped_masonry',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('high');
      expect(result.description).toContain('crecimiento activo post-sismo');
    });
  });

  describe('Medium Damage Conditions (riskLevel: "medium")', () => {
    it('classifies reentrant_corner on partition wall as medium', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'partition-wall' },
        'reentrant_corner',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('medium');
      expect(result.description).toContain('Monitorear la evolución');
    });

    it('classifies interface_wall_column and interface_wall_beam as medium', () => {
      const resultCol = evaluateEmergencyOffline(
        BASE_CONTEXT,
        'interface_wall_column',
        NO_SIGNALS,
      );
      expect(resultCol.riskLevel).toBe('medium');

      const resultBeam = evaluateEmergencyOffline(
        BASE_CONTEXT,
        'interface_wall_beam',
        NO_SIGNALS,
      );
      expect(resultBeam.riskLevel).toBe('medium');
    });

    it('classifies partition wall with recentGrowth as medium', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'partition-wall', recentGrowth: true },
        'hairline_cosmetic',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('medium');
    });
  });

  describe('Low Damage Conditions (riskLevel: "low")', () => {
    it('classifies hairline_cosmetic on partition wall as low', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'partition-wall' },
        'hairline_cosmetic',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('low');
      expect(result.description).toContain('Inmueble habitable');
    });

    it('classifies vertical_shrinkage on partition wall as low', () => {
      const result = evaluateEmergencyOffline(
        { ...BASE_CONTEXT, elementType: 'partition-wall' },
        'vertical_shrinkage',
        NO_SIGNALS,
      );

      expect(result.riskLevel).toBe('low');
      expect(result.description).toContain('Inmueble habitable');
    });
  });
});
