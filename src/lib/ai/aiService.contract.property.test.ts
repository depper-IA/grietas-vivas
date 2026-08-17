/**
 * Property-Based Tests: AI Service Adapter Interface Contract (Property 14)
 *
 * Validates: Requirements 7.1
 *
 * These tests verify the structural contract of the AIServiceAdapter.analyze() method:
 * - Risk_Level is always one of exactly {low, medium, high, critical}
 * - Description never exceeds 2000 characters
 * - Confidence is always a numeric value in [0, 1]
 * - Provider name is always a non-empty string
 * - analyzedAt is always a valid ISO 8601 datetime string
 * - Images exceeding 10 MB are always rejected with IMAGE_TOO_LARGE
 * - Images <= 10 MB are never rejected for size reasons
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { AIServiceAdapter, AIServiceError } from './aiService';
import type { AIConfig, IAIProvider, AnalysisPayload, RawProviderResponse } from './types';

// --- Constants ---

const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// --- Test Helpers ---

/** Default fallback config for contract tests */
const CONTRACT_CONFIG: AIConfig = {
  mode: 'fallback',
  fallbackPriority: ['contract-test'],
};

/**
 * Generate valid provider responses with arbitrary valid values.
 * The provider returns raw JSON that the adapter will parse and validate.
 */
const validResponseArb = fc.record({
  riskLevel: fc.constantFrom('low', 'medium', 'high', 'critical'),
  description: fc.string({ maxLength: 2000 }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
});

/**
 * Create a mock provider that returns the generated response as JSON content.
 */
function createContractProvider(response: {
  riskLevel: string;
  description: string;
  confidence: number;
}): IAIProvider {
  return {
    name: 'contract-test',
    analyze: vi.fn().mockResolvedValue({ content: JSON.stringify(response) }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Create an adapter with a provider that returns the given response.
 */
function createAdapterWithResponse(response: {
  riskLevel: string;
  description: string;
  confidence: number;
}): AIServiceAdapter {
  const adapter = new AIServiceAdapter();
  adapter.registerProvider(createContractProvider(response));
  return adapter;
}

/**
 * Create a test blob with arrayBuffer polyfill for jsdom.
 * jsdom's Blob may not implement arrayBuffer(), so we polyfill it.
 */
function createTestBlob(sizeBytes: number = 100): Blob {
  const data = new Uint8Array(sizeBytes);
  const blob = new Blob([data], { type: 'image/jpeg' });

  if (typeof blob.arrayBuffer !== 'function') {
    (blob as unknown as Record<string, unknown>).arrayBuffer = async () => data.buffer;
  }

  return blob;
}

// --- Property Tests ---

describe('Property 14: AI Service Adapter Interface Contract', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * Property: For ANY valid call to analyze(), the returned result MUST always
   * contain: Risk_Level from exactly {low, medium, high, critical}, a description
   * of maximum 2000 characters, and a numeric confidence value. Images exceeding
   * 10 MB MUST be rejected.
   */

  describe('analyze() always returns valid Risk_Level', () => {
    it('for any valid provider response, the returned riskLevel is always one of exactly [low, medium, high, critical]', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, CONTRACT_CONFIG);

          expect(VALID_RISK_LEVELS).toContain(result.riskLevel);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('analyze() description never exceeds 2000 chars', () => {
    it('for any successful analysis, result.description.length <= 2000', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, CONTRACT_CONFIG);

          expect(result.description.length).toBeLessThanOrEqual(2000);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('analyze() confidence is always numeric in [0, 1]', () => {
    it('for any successful analysis, confidence is a number between 0 and 1 inclusive', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, CONTRACT_CONFIG);

          expect(typeof result.confidence).toBe('number');
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          expect(Number.isNaN(result.confidence)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('analyze() always includes provider name', () => {
    it('for any successful analysis, result.provider is a non-empty string', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, CONTRACT_CONFIG);

          expect(typeof result.provider).toBe('string');
          expect(result.provider.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('analyze() always includes analyzedAt timestamp', () => {
    it('for any successful analysis, result.analyzedAt is a valid ISO 8601 datetime string', async () => {
      await fc.assert(
        fc.asyncProperty(validResponseArb, async (response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob();

          const result = await adapter.analyze(blob, CONTRACT_CONFIG);

          expect(typeof result.analyzedAt).toBe('string');
          // Must be parseable as a valid date
          const date = new Date(result.analyzedAt);
          expect(date.toString()).not.toBe('Invalid Date');
          // Must round-trip through toISOString (valid ISO 8601 format)
          expect(date.toISOString()).toBe(result.analyzedAt);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Images > 10 MB always rejected', () => {
    it('blobs exceeding 10 MB always throw AIServiceError with code IMAGE_TOO_LARGE', async () => {
      // Generate sizes just above the 10 MB limit (10MB + 1 byte to 10MB + 100KB)
      const oversizedArb = fc.integer({ min: MAX_IMAGE_SIZE_BYTES + 1, max: MAX_IMAGE_SIZE_BYTES + 1024 * 100 });

      await fc.assert(
        fc.asyncProperty(oversizedArb, async (size) => {
          const adapter = new AIServiceAdapter();
          adapter.registerProvider({
            name: 'contract-test',
            analyze: vi.fn().mockResolvedValue({ content: '{}' }),
            isAvailable: vi.fn().mockResolvedValue(true),
          });

          // Create a blob with the exact oversized byte count
          const blob = createTestBlob(size);

          try {
            await adapter.analyze(blob, CONTRACT_CONFIG);
            expect.fail('Expected AIServiceError to be thrown for oversized image');
          } catch (error) {
            expect(error).toBeInstanceOf(AIServiceError);
            const aiError = error as AIServiceError;
            expect(aiError.safeResponse.error.code).toBe('IMAGE_TOO_LARGE');
          }
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('Images <= 10 MB never rejected for size', () => {
    it('blobs between 1 byte and 10 MB do NOT throw IMAGE_TOO_LARGE', async () => {
      // Generate sizes from 1 byte to exactly 10 MB
      const validSizeArb = fc.integer({ min: 1, max: MAX_IMAGE_SIZE_BYTES });

      await fc.assert(
        fc.asyncProperty(validSizeArb, validResponseArb, async (size, response) => {
          const adapter = createAdapterWithResponse(response);
          const blob = createTestBlob(size);

          // Should not throw IMAGE_TOO_LARGE (may succeed or throw other errors)
          try {
            await adapter.analyze(blob, CONTRACT_CONFIG);
            // Success is expected — no size rejection
          } catch (error) {
            if (error instanceof AIServiceError) {
              // Must NOT be IMAGE_TOO_LARGE
              expect(error.safeResponse.error.code).not.toBe('IMAGE_TOO_LARGE');
            }
            // Other errors (provider, network) are acceptable — just not size rejection
          }
        }),
        { numRuns: 20 },
      );
    });
  });
});
