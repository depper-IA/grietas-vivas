import { describe, it, expect } from 'vitest';
import {
  buildCalibrationText,
  buildRagSection,
  type CalibrationExample,
} from './rag';

describe('rag module', () => {
  describe('buildCalibrationText', () => {
    it('marks AI correct cases verdicts', () => {
      const text = buildCalibrationText({
        riskLevel: 'critical',
        pattern: 'diagonal_shear',
        isAccurate: true,
      });
      expect(text).toContain('IA diagnostico correcto');
      expect(text).toContain('diagonal_shear');
      expect(text).toContain('critical');
    });

    it('flags wrong AI cases as expert corrections', () => {
      const text = buildCalibrationText({
        riskLevel: 'high',
        pattern: 'vertical_shrinkage',
        isAccurate: false,
        notes: 'Fisura de 4mm con desplazamiento',
      });
      expect(text).toContain('Correccion experta');
      expect(text).toContain('high');
      expect(text).toContain('Observaciones tecnicas:');
      expect(text).toContain('Fisura de 4mm con desplazamiento');
    });

    it('omits notes field when empty', () => {
      const text = buildCalibrationText({
        riskLevel: 'low',
        pattern: 'hairline_cosmetic',
        isAccurate: true,
        notes: '   ',
      });
      expect(text).not.toContain('Observaciones tecnicas');
    });
  });

  describe('buildRagSection', () => {
    it('returns empty string for no examples', () => {
      expect(buildRagSection([])).toBe('');
    });

    it('serializes examples with similarity score', () => {
      const examples: CalibrationExample[] = [
        {
          risk_level: 'critical',
          pattern: 'diagonal_shear',
          calibration_text: 'Patron: diagonal_shear. Riesgo: critical',
          similarity: 0.87,
        },
      ];
      const section = buildRagSection(examples);
      expect(section).toContain('CASOS RECIENTES VERIFICADOS');
      expect(section).toContain('87%');
      expect(section).toContain('diagonal_shear');
    });
  });
});
