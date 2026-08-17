/**
 * Tests para schemas.ts — Re-exports del modulo crackTaxonomy y
 * campos opcionales del sync payload (slice 4 de seismic-triage-upgrade).
 *
 * Contrato:
 *   - Los tipos y esquemas de `crackTaxonomy` se re-exportan desde
 *     `schemas.ts` para que los consumidores aguas abajo importen
 *     un solo modulo.
 *   - `syncPayloadSchema` acepta campos opcionales del slice 4:
 *     contextImageBase64, pattern, dangerSignals, inspectionReportId.
 *   - Los campos del slice 4 NO son requeridos (retro-compatibilidad).
 *   - pattern y dangerSignals validan contra los enums/zod objects
 *     originales.
 */

import { describe, it, expect } from 'vitest';
import {
  CRACK_PATTERN_VALUES,
  crackPatternSchema,
  dangerSignalsSchema,
  PATTERN_METADATA,
  evaluateSafetyOverride,
  syncPayloadSchema,
  type CrackPattern,
  type DangerSignals,
  type TriageOutcome,
} from './schemas';

describe('schemas.ts — re-exports de crackTaxonomy', () => {
  it('re-exporta CRACK_PATTERN_VALUES con 10 entradas', () => {
    expect(CRACK_PATTERN_VALUES.length).toBe(10);
  });

  it('re-exporta crackPatternSchema (Zod enum)', () => {
    const result = crackPatternSchema.safeParse('diagonal_shear');
    expect(result.success).toBe(true);
  });

  it('re-exporta dangerSignalsSchema (Zod object)', () => {
    const sample: DangerSignals = {
      jammedDoorsWindows: false,
      unleveledFloors: false,
      tiltedElements: false,
      exposedRebarSpalling: false,
      throughWallXCracks: false,
    };
    const result = dangerSignalsSchema.safeParse(sample);
    expect(result.success).toBe(true);
  });

  it('re-exporta PATTERN_METADATA (10 patrones)', () => {
    const keys = Object.keys(PATTERN_METADATA);
    expect(keys.length).toBe(10);
  });

  it('re-exporta evaluateSafetyOverride (funcion pura)', () => {
    const sample: DangerSignals = {
      jammedDoorsWindows: false,
      unleveledFloors: false,
      tiltedElements: false,
      exposedRebarSpalling: true,
      throughWallXCracks: false,
    };
    const outcome: TriageOutcome = evaluateSafetyOverride(
      'hairline_cosmetic',
      sample,
      'low'
    );
    expect(outcome.level).toBe('evacuate_emergency');
    expect(outcome.safetyOverride).toBe(true);
  });

  it('re-exporta tipos CrackPattern', () => {
    const pattern: CrackPattern = 'diagonal_shear';
    expect(pattern).toBe('diagonal_shear');
  });
});

describe('schemas.ts — syncPayloadSchema con campos slice 4', () => {
  const basePayload = {
    imageBase64: 'aGVsbG8=',
    metadata: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: {
        local: '2024-01-15T10:30:00.000Z',
        server: '2024-01-15T10:30:01.000Z',
        verified: true,
      },
      gps: {
        latitude: 3.45,
        longitude: -76.53,
        accuracy: 12.5,
        available: true,
        reliable: true,
      },
      orientation: {
        alpha: 180,
        beta: 45,
        gamma: 0,
        available: true,
      },
      deviceInfo: {
        userAgent: 'test-agent',
        platform: 'test-platform',
      },
    },
    analysisResult: {
      riskLevel: 'high' as const,
      description: 'Test',
      confidence: 0.85,
      provider: 'openrouter',
      analyzedAt: '2024-01-15T10:30:05.000Z',
    },
  };

  it('acepta payload legacy (sin campos slice 4)', () => {
    const result = syncPayloadSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
  });

  it('acepta payload con patron y dangerSignals', () => {
    const result = syncPayloadSchema.safeParse({
      ...basePayload,
      pattern: 'diagonal_shear',
      dangerSignals: {
        jammedDoorsWindows: true,
        unleveledFloors: false,
        tiltedElements: false,
        exposedRebarSpalling: false,
        throughWallXCracks: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('acepta payload con contextImageBase64 y inspectionReportId', () => {
    const result = syncPayloadSchema.safeParse({
      ...basePayload,
      contextImageBase64: 'Y29udGV4dA==',
      inspectionReportId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza pattern invalido', () => {
    const result = syncPayloadSchema.safeParse({
      ...basePayload,
      pattern: 'invalid_pattern',
    });
    expect(result.success).toBe(false);
  });
});
