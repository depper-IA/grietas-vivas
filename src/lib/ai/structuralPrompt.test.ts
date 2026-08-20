/**
 * Structural Engineering Prompt & Rule Engine — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildStructuralPrompt,
  applyStructuralRules,
  type StructuralContext,
  type StructuralAnalysisResult,
} from './structuralPrompt';

describe('structuralPrompt', () => {
  const baseContext: StructuralContext = {
    elementType: 'load-bearing-wall',
    crossesFullSpan: true,
    hasScaleReference: true,
    scaleReferenceType: 'coin',
    recentGrowth: true,
    buildingFloors: 5,
    crackFloor: 2,
    estimatedDistance: 1.5,
  };

  describe('buildStructuralPrompt', () => {
    it('generates prompt with single image instructions when hasContextImage is false or omitted', async () => {
      const prompt = await buildStructuralPrompt(baseContext);

      expect(prompt).toContain('NSR-10 Colombia / FEMA 306');
      expect(prompt).toContain('Muro de carga / portante');
      expect(prompt).toContain('SÍ (indicador grave de compromiso estructural)');
      expect(prompt).toContain('SÍ (progresión activa)');
      expect(prompt).toContain('REFERENCIA DE ESCALA APROXIMADA: Moneda colombiana');
      expect(prompt).toContain('FOTOGRAFÍA ADJUNTA PARA EL ANÁLISIS');
      expect(prompt).toContain('Patrón:');
      expect(prompt).toContain('Ubicación:');
      expect(prompt).toContain('Severidad:');
      expect(prompt).toContain('Recomendación:');
    });

    it('generates prompt with dual image instructions when hasContextImage is true', async () => {
      const prompt = await buildStructuralPrompt(baseContext, true);

      expect(prompt).toContain('FOTOGRAFÍAS ADJUNTAS PARA EL ANÁLISIS MULTIMODAL');
      expect(prompt).toContain('Foto 1 (Detalle de la grieta)');
      expect(prompt).toContain('Foto 2 (Contexto estructural del entorno)');
      expect(prompt).toContain('vigas, columnas, nudos');
    });

    it('handles different scale reference types correctly', async () => {
      const coinPrompt = await buildStructuralPrompt({
        ...baseContext,
        scaleReferenceType: 'coin',
        coinDenomination: 500,
      });
      expect(coinPrompt).toContain('Moneda colombiana de $500 (diámetro exacto: 23.7 mm)');

      const unspecifiedCoinPrompt = await buildStructuralPrompt({
        ...baseContext,
        scaleReferenceType: 'coin',
        coinDenomination: undefined,
      });
      expect(unspecifiedCoinPrompt).toContain('REFERENCIA DE ESCALA APROXIMADA: Moneda colombiana');

      const handPrompt = await buildStructuralPrompt({
        ...baseContext,
        scaleReferenceType: 'hand',
      });
      expect(handPrompt).toContain('REFERENCIA DE ESCALA APROXIMADA: Mano humana');
      expect(handPrompt).toContain('rango real ≈ 7-12 cm');

      const noScalePrompt = await buildStructuralPrompt({
        ...baseContext,
        hasScaleReference: false,
      });
      expect(noScalePrompt).toContain('REFERENCIA DE ESCALA: Ninguna específica');
    });
  });

  describe('applyStructuralRules', () => {
    it('escalates to critical if hasExposedRebar or hasDisplacement is true', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'medium',
        description: 'Grieta moderada',
        confidence: 0.8,
        hasExposedRebar: true,
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'partition-wall',
      });

      expect(adjusted.riskLevel).toBe('critical');
      expect(adjusted.description).toContain('[Nota: Nivel de riesgo ajustado de "medium" a "critical"');
    });

    it('escalates to critical if column/beam has shear crack crossing full span', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'medium',
        description: 'Grieta diagonal',
        confidence: 0.8,
        crackType: 'shear',
        crossesFullSpan: true,
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'column',
      });

      expect(adjusted.riskLevel).toBe('critical');
    });

    it('escalates to high if column/beam has width > 2mm and was low', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'low',
        description: 'Grieta en viga',
        confidence: 0.8,
        estimatedWidthMm: 3.5,
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'beam',
        crossesFullSpan: false,
        recentGrowth: false,
      });

      expect(adjusted.riskLevel).toBe('high');
    });

    it('caps partition wall risk at medium', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'high',
        description: 'Grieta en tabique',
        confidence: 0.8,
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'partition-wall',
        recentGrowth: false,
      });

      expect(adjusted.riskLevel).toBe('medium');
    });

    it('increases risk by one level if recentGrowth is true', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'low',
        description: 'Fisura reciente',
        confidence: 0.8,
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'load-bearing-wall',
        crossesFullSpan: false,
        recentGrowth: true,
      });

      expect(adjusted.riskLevel).toBe('medium');
    });

    it('caps cosmetic/hairline on partition wall at low', () => {
      const result: StructuralAnalysisResult = {
        riskLevel: 'medium',
        description: 'Fisura cosmética',
        confidence: 0.8,
        crackType: 'cosmetic',
      };

      const adjusted = applyStructuralRules(result, {
        ...baseContext,
        elementType: 'partition-wall',
        recentGrowth: false,
      });

      expect(adjusted.riskLevel).toBe('low');
    });
  });
});
