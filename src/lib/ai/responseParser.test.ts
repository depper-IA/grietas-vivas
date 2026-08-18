/**
 * Response Parser — Unit Tests
 *
 * Tests for the defensive AI response parsers that handle non-standard
 * outputs from providers like NVIDIA NIM.
 */

import { describe, it, expect } from 'vitest';
import { stripMarkdownJsonWrapper, parseMarkdownResponse } from './responseParser';

describe('stripMarkdownJsonWrapper', () => {
  describe('plain JSON passthrough', () => {
    it('returns valid JSON as-is', () => {
      const json = '{"riskLevel":"high","description":"x","confidence":0.9}';
      expect(stripMarkdownJsonWrapper(json)).toBe(json);
    });

    it('handles JSON with leading/trailing whitespace', () => {
      const json = '  {"a":1}  ';
      expect(stripMarkdownJsonWrapper(json)).toBe('{"a":1}');
    });

    it('handles JSON with internal newlines', () => {
      const json = '{\n  "a": 1,\n  "b": 2\n}';
      expect(stripMarkdownJsonWrapper(json)).toBe(json);
    });
  });

  describe('markdown fence stripping', () => {
    it('strips ```json fences', () => {
      const content = '```json\n{"a":1}\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"a":1}');
    });

    it('strips ``` fences without language tag', () => {
      const content = '```\n{"a":1}\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"a":1}');
    });

    it('strips fences with whitespace variations', () => {
      expect(stripMarkdownJsonWrapper('```json {"a":1}```')).toBe('{"a":1}');
      expect(stripMarkdownJsonWrapper('```JSON\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('handles truncated fence (no closing ```)', () => {
      const content = '```json\n{"a":1,"b":2}';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"a":1,"b":2}');
    });

    it('handles prose before and after the JSON', () => {
      const content = 'Here is the analysis:\n```json\n{"a":1}\n```\nLet me know if you need more.';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"a":1}');
    });
  });

  describe('nested braces and strings', () => {
    it('handles nested objects correctly', () => {
      const content = '```json\n{"outer":{"inner":{"deep":1}}}\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"outer":{"inner":{"deep":1}}}');
    });

    it('handles braces inside strings correctly', () => {
      const content = '```json\n{"text":"has } brace","value":2}\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"text":"has } brace","value":2}');
    });

    it('handles escaped quotes inside strings', () => {
      const content = '```json\n{"text":"escaped \\"quote\\"","value":2}\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe(
        '{"text":"escaped \\"quote\\"","value":2}',
      );
    });
  });

  describe('edge cases', () => {
    it('returns trimmed content when no JSON object exists', () => {
      const content = '```\nNo JSON here\n```';
      expect(stripMarkdownJsonWrapper(content)).toBe('No JSON here');
    });

    it('returns empty string for empty input', () => {
      expect(stripMarkdownJsonWrapper('')).toBe('');
    });

    it('returns the first JSON object when multiple exist', () => {
      const content = '```json\n{"first":1}\n```and also {"second":2}';
      expect(stripMarkdownJsonWrapper(content)).toBe('{"first":1}');
    });
  });
});

describe('parseMarkdownResponse', () => {
  describe('bold-markdown format (English)', () => {
    it('parses the canonical NVIDIA NIM format', () => {
      const content = `**Risk Level:** Critical
**Description:** Severe structural damage observed.
**Confidence:** 0.85`;

      const result = parseMarkdownResponse(content);
      expect(result).toEqual({
        riskLevel: 'critical',
        description: 'Severe structural damage observed.',
        confidence: 0.85,
      });
    });

    it('parses with different separators', () => {
      const content = '**Risk Level**: High\n**Description**: Some damage\n**Confidence**: 0.7';
      const result = parseMarkdownResponse(content);
      expect(result?.riskLevel).toBe('high');
      expect(result?.description).toBe('Some damage');
      expect(result?.confidence).toBe(0.7);
    });

    it('handles missing confidence field with default 0.7', () => {
      const content = '**Risk Level:** Low\n**Description:** Minor crack';
      const result = parseMarkdownResponse(content);
      expect(result?.riskLevel).toBe('low');
      expect(result?.confidence).toBe(0.7);
    });
  });

  describe('bold-markdown format (Spanish)', () => {
    it('parses Spanish labels', () => {
      const content = `**Nivel de Riesgo:** Crítico
**Descripción:** Daño estructural severo observado.
**Confianza:** 0.85`;

      const result = parseMarkdownResponse(content);
      expect(result).toEqual({
        riskLevel: 'critical',
        description: 'Daño estructural severo observado.',
        confidence: 0.85,
      });
    });

    it('handles short Spanish labels (Riesgo, Descripción, Confianza)', () => {
      const content = '**Riesgo:** Alto\n**Descripción:** Grieta visible\n**Confianza:** 90%';
      const result = parseMarkdownResponse(content);
      expect(result?.riskLevel).toBe('high');
      expect(result?.description).toBe('Grieta visible');
      expect(result?.confidence).toBe(0.9);
    });
  });

  describe('plain markdown format (no bold)', () => {
    it('parses plain markdown in English', () => {
      const content = 'Risk Level: Medium\nDescription: Moderate damage\nConfidence: 0.6';
      const result = parseMarkdownResponse(content);
      expect(result?.riskLevel).toBe('medium');
      expect(result?.description).toBe('Moderate damage');
      expect(result?.confidence).toBe(0.6);
    });

    it('parses plain markdown in Spanish', () => {
      const content = 'Nivel de Riesgo: Medio\nDescripción: Daño moderado\nConfianza: 0.6';
      const result = parseMarkdownResponse(content);
      expect(result?.riskLevel).toBe('medium');
      expect(result?.description).toBe('Daño moderado');
      expect(result?.confidence).toBe(0.6);
    });
  });

  describe('risk level aliasing (English)', () => {
    it('maps "minor" to "low"', () => {
      const result = parseMarkdownResponse('**Risk Level:** Minor\n**Description:** x');
      expect(result?.riskLevel).toBe('low');
    });

    it('maps "severe" to "high"', () => {
      const result = parseMarkdownResponse('**Risk Level:** Severe\n**Description:** x');
      expect(result?.riskLevel).toBe('high');
    });

    it('maps "extreme" to "critical"', () => {
      const result = parseMarkdownResponse('**Risk Level:** Extreme\n**Description:** x');
      expect(result?.riskLevel).toBe('critical');
    });

    it('defaults unknown risk levels to "medium"', () => {
      const result = parseMarkdownResponse('**Risk Level:** Weird\n**Description:** x');
      expect(result?.riskLevel).toBe('medium');
    });

    it('takes only the first word of risk level', () => {
      const result = parseMarkdownResponse('**Risk Level:** High severity\n**Description:** x');
      expect(result?.riskLevel).toBe('high');
    });
  });

  describe('risk level aliasing (Spanish)', () => {
    it('maps "bajo" to "low"', () => {
      const result = parseMarkdownResponse('**Nivel:** Bajo\n**Descripción:** x');
      expect(result?.riskLevel).toBe('low');
    });

    it('maps "leve" to "low"', () => {
      const result = parseMarkdownResponse('**Nivel:** Leve\n**Descripción:** x');
      expect(result?.riskLevel).toBe('low');
    });

    it('maps "medio" to "medium"', () => {
      const result = parseMarkdownResponse('**Nivel:** Medio\n**Descripción:** x');
      expect(result?.riskLevel).toBe('medium');
    });

    it('maps "alto" to "high"', () => {
      const result = parseMarkdownResponse('**Nivel:** Alto\n**Descripción:** x');
      expect(result?.riskLevel).toBe('high');
    });

    it('maps "grave" to "high"', () => {
      const result = parseMarkdownResponse('**Nivel:** Grave\n**Descripción:** x');
      expect(result?.riskLevel).toBe('high');
    });

    it('maps "crítico" to "critical"', () => {
      const result = parseMarkdownResponse('**Nivel:** Crítico\n**Descripción:** x');
      expect(result?.riskLevel).toBe('critical');
    });

    it('maps "urgente" to "critical"', () => {
      const result = parseMarkdownResponse('**Nivel:** Urgente\n**Descripción:** x');
      expect(result?.riskLevel).toBe('critical');
    });

    it('handles "crítico" without accent', () => {
      const result = parseMarkdownResponse('**Nivel:** Critico\n**Descripción:** x');
      expect(result?.riskLevel).toBe('critical');
    });
  });

  describe('confidence parsing', () => {
    it('accepts 0-100 scale and normalizes to 0-1', () => {
      const result = parseMarkdownResponse(
        '**Risk Level:** Low\n**Description:** x\n**Confidence:** 85',
      );
      expect(result?.confidence).toBe(0.85);
    });

    it('accepts percentage sign', () => {
      const result = parseMarkdownResponse(
        '**Risk Level:** Low\n**Description:** x\n**Confidence:** 85%',
      );
      expect(result?.confidence).toBe(0.85);
    });

    it('keeps 0-1 scale as-is', () => {
      const result = parseMarkdownResponse(
        '**Risk Level:** Low\n**Description:** x\n**Confidence:** 0.42',
      );
      expect(result?.confidence).toBe(0.42);
    });

    it('falls back to 0.7 for invalid confidence values', () => {
      const result = parseMarkdownResponse(
        '**Risk Level:** Low\n**Description:** x\n**Confidence:** not a number',
      );
      expect(result?.confidence).toBe(0.7);
    });
  });

  describe('description truncation', () => {
    it('truncates descriptions longer than 2000 characters', () => {
      const longDesc = 'x'.repeat(2500);
      const result = parseMarkdownResponse(
        `**Risk Level:** Low\n**Description:** ${longDesc}`,
      );
      expect(result?.description.length).toBe(2000);
    });
  });

  describe('rejection cases', () => {
    it('returns null when risk level is missing', () => {
      const result = parseMarkdownResponse('**Description:** x');
      expect(result).toBeNull();
    });

    it('returns null when description is missing', () => {
      const result = parseMarkdownResponse('**Risk Level:** High');
      expect(result).toBeNull();
    });

    it('returns null for empty content', () => {
      expect(parseMarkdownResponse('')).toBeNull();
    });
  });
});