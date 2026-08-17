/**
 * Property-Based Tests: AI Response Schema Validation (Property 11)
 *
 * Validates: Requirements 5.3, 5.6, 6.5, 7.3, 7.4
 *
 * These tests verify that the AIServiceAdapter correctly validates AI provider
 * responses against the Zod schema, accepting conforming responses and rejecting
 * non-conforming ones with structured errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AIServiceAdapter, AIServiceError } from './aiService';
import type { AIConfig, IAIProvider, AnalysisPayload, RawProviderResponse } from './types';

// --- Test Helpers ---

/** Valid risk levels as defined by the schema */
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

/** Default AI config for tests using fallback mode */
const TEST_CONFIG: AIConfig = {
  mode: 'fallback',
  fallbackPriority: ['test-provider'],
};

/** Minimal valid image blob for tests that works in jsdom environment */
function createTestBlob(): Blob {
  const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
  const blob = new Blob([data], { type: 'image/jpeg' });
  // Ensure arrayBuffer is available (polyfill for jsdom)
  if (!blob.arrayBuffer) {
    (blob as unknown as Record<string, unknown>).arrayBuffer = () =>
      Promise.resolve(data.buffer);
  }
  return blob;
}

/** Create a mock provider that returns the specified content string */
function createMockProvider(content: string): IAIProvider {
  return {
    name: 'test-provider',
    analyze: async (_payload: AnalysisPayload): Promise<RawProviderResponse> => ({
      content,
    }),
    isAvailable: async () => true,
  };
}

/** Create a fresh adapter with a mock provider registered */
function createAdapterWithProvider(content: string): AIServiceAdapter {
  const adapter = new AIServiceAdapter();
  adapter.registerProvider(createMockProvider(content));
  return adapter;
}

// --- Arbitraries ---

/** Arbitrary for valid risk levels */
const validRiskLevelArb = fc.constantFrom(...VALID_RISK_LEVELS);

/** Arbitrary for valid description (string ≤ 2000 chars) */
const validDescriptionArb = fc.string({ minLength: 0, maxLength: 2000 });

/** Arbitrary for valid confidence score (0.0 to 1.0 inclusive) */
const validConfidenceArb = fc.double({ min: 0, max: 1, noNaN: true });

/** Arbitrary for a valid JSON response object (without provider/analyzedAt — those are enriched) */
const validResponseArb = fc.record({
  riskLevel: validRiskLevelArb,
  description: validDescriptionArb,
  confidence: validConfidenceArb,
});

/** Arbitrary for invalid risk levels — strings NOT in the valid set */
const invalidRiskLevelArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !VALID_RISK_LEVELS.includes(s as (typeof VALID_RISK_LEVELS)[number]));

/** Arbitrary for descriptions exceeding 2000 chars */
const longDescriptionArb = fc.string({ minLength: 2001, maxLength: 3000 });

/** Arbitrary for confidence values out of [0, 1] range */
const outOfRangeConfidenceArb = fc.oneof(
  fc.double({ min: -1000, max: -0.001, noNaN: true }),
  fc.double({ min: 1.001, max: 1000, noNaN: true }),
);

/** Arbitrary for non-JSON strings (strings that cannot be parsed as JSON) */
const nonJsonStringArb = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  });

// --- Property Tests ---

describe('Property 11: AI Response Schema Validation', () => {
  /**
   * **Validates: Requirements 5.3, 5.6, 6.5, 7.3, 7.4**
   *
   * Property: For ANY response from an AI provider (BYOK or Fallback),
   * the system must validate it against the Zod schema. If the response conforms,
   * it must produce a valid AnalysisResult. If it does not conform, it must reject
   * the response with a structured error and never pass invalid data downstream.
   */

  describe('Valid responses always produce valid AnalysisResult', () => {
    it('should return a valid AnalysisResult for any conforming response', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const content = JSON.stringify(response);
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, TEST_CONFIG);

          // Must return a valid AnalysisResult matching schema constraints
          expect(VALID_RISK_LEVELS).toContain(result.riskLevel);
          expect(result.description.length).toBeLessThanOrEqual(2000);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          expect(result.provider).toBe('test-provider');
          expect(result.analyzedAt).toBeDefined();
          // analyzedAt must be a valid ISO 8601 datetime
          expect(() => new Date(result.analyzedAt).toISOString()).not.toThrow();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Invalid riskLevel always rejected', () => {
    it('should throw AIServiceError with RESPONSE_VALIDATION_ERROR for invalid riskLevel', async () => {
      await fc.assert(
        fc.asyncProperty(invalidRiskLevelArb, validDescriptionArb, validConfidenceArb, async (riskLevel, description, confidence) => {
          const content = JSON.stringify({ riskLevel, description, confidence });
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          try {
            await adapter.analyze(blob, TEST_CONFIG);
            // Should never reach here
            expect.fail('Expected AIServiceError to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AIServiceError);
            const aiError = error as AIServiceError;
            expect(aiError.safeResponse.error.code).toBe('RESPONSE_VALIDATION_ERROR');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Description exceeding 2000 chars always rejected', () => {
    it('should throw AIServiceError with RESPONSE_VALIDATION_ERROR for long descriptions', async () => {
      await fc.assert(
        fc.asyncProperty(validRiskLevelArb, longDescriptionArb, validConfidenceArb, async (riskLevel, description, confidence) => {
          const content = JSON.stringify({ riskLevel, description, confidence });
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          try {
            await adapter.analyze(blob, TEST_CONFIG);
            expect.fail('Expected AIServiceError to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AIServiceError);
            const aiError = error as AIServiceError;
            expect(aiError.safeResponse.error.code).toBe('RESPONSE_VALIDATION_ERROR');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Confidence out of [0,1] range always rejected', () => {
    it('should throw AIServiceError with RESPONSE_VALIDATION_ERROR for out-of-range confidence', async () => {
      await fc.assert(
        fc.asyncProperty(validRiskLevelArb, validDescriptionArb, outOfRangeConfidenceArb, async (riskLevel, description, confidence) => {
          const content = JSON.stringify({ riskLevel, description, confidence });
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          try {
            await adapter.analyze(blob, TEST_CONFIG);
            expect.fail('Expected AIServiceError to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AIServiceError);
            const aiError = error as AIServiceError;
            expect(aiError.safeResponse.error.code).toBe('RESPONSE_VALIDATION_ERROR');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Non-JSON content always rejected', () => {
    it('should throw AIServiceError with RESPONSE_PARSE_ERROR for non-JSON strings', async () => {
      await fc.assert(
        fc.asyncProperty(nonJsonStringArb, async (content) => {
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          try {
            await adapter.analyze(blob, TEST_CONFIG);
            expect.fail('Expected AIServiceError to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AIServiceError);
            const aiError = error as AIServiceError;
            expect(aiError.safeResponse.error.code).toBe('RESPONSE_PARSE_ERROR');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Valid responses never lose data', () => {
    it('should preserve original riskLevel, description, and confidence from the response', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const content = JSON.stringify(response);
          const adapter = createAdapterWithProvider(content);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, TEST_CONFIG);

          // The returned AnalysisResult must preserve the original values
          expect(result.riskLevel).toBe(response.riskLevel);
          expect(result.description).toBe(response.description);
          expect(result.confidence).toBe(response.confidence);
        }),
        { numRuns: 100 },
      );
    });
  });
});
