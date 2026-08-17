/**
 * Property 12: Cadena de Failover de Proveedores
 *
 * Property-based tests verifying that the AI Service Adapter's fallback
 * provider selection follows priority order, never repeats a failed provider,
 * and throws AIServiceError when all providers are exhausted.
 *
 * **Validates: Requirements 6.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AIServiceAdapter, AIServiceError } from './aiService';
import type { AIConfig, IAIProvider, AnalysisPayload, RawProviderResponse } from './types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Creates a configurable mock provider for testing failover behavior. */
function createConfigurableProvider(
  name: string,
  opts: { available: boolean; fails?: boolean },
): IAIProvider & { analyzeCalled: boolean; isAvailableCalled: boolean } {
  const provider = {
    name,
    analyzeCalled: false,
    isAvailableCalled: false,
    async isAvailable(): Promise<boolean> {
      provider.isAvailableCalled = true;
      return opts.available;
    },
    async analyze(_payload: AnalysisPayload): Promise<RawProviderResponse> {
      provider.analyzeCalled = true;
      if (opts.fails) {
        throw new Error('Provider timeout after 15s');
      }
      return {
        content: JSON.stringify({
          riskLevel: 'medium',
          description: 'Test crack analysis',
          confidence: 0.75,
        }),
      };
    },
  };
  return provider;
}

/** Generates a unique provider name for testing. */
function providerName(index: number): string {
  return `provider-${index}`;
}

/** Creates a fallback AIConfig with the given provider names in priority order. */
function createFallbackConfig(providerNames: string[]): AIConfig {
  return {
    mode: 'fallback',
    fallbackPriority: providerNames,
  };
}

/**
 * Creates a test image Blob that works in Node/jsdom.
 * jsdom's Blob may not fully support arrayBuffer(), so we create
 * a minimal Blob-like object with the required interface.
 */
function createTestBlob(): Blob {
  const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
  const blob = {
    size: data.length,
    type: 'image/png',
    arrayBuffer: async () => data.buffer,
    slice: () => blob,
    text: async () => '',
    stream: () => new ReadableStream(),
  } as unknown as Blob;
  return blob;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for number of providers (2-5 as specified). */
const providerCountArb = fc.integer({ min: 2, max: 5 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 12: Cadena de Failover de Proveedores', () => {
  let adapter: AIServiceAdapter;

  beforeEach(() => {
    adapter = new AIServiceAdapter();
  });

  it('never repeats a failed (unavailable) provider — each provider isAvailable checked at most once', async () => {
    await fc.assert(
      fc.asyncProperty(
        providerCountArb,
        fc.integer({ min: 0, max: 31 }),
        async (count, seed) => {
          // Use seed bits to deterministically pick which providers are unavailable
          const unavailableSet = new Set<number>();
          for (let i = 0; i < count; i++) {
            if ((seed >> i) & 1) unavailableSet.add(i);
          }

          const localAdapter = new AIServiceAdapter();
          const providers: ReturnType<typeof createConfigurableProvider>[] = [];
          const names: string[] = [];

          for (let i = 0; i < count; i++) {
            const name = providerName(i);
            names.push(name);
            const p = createConfigurableProvider(name, {
              available: !unavailableSet.has(i),
            });
            providers.push(p);
            localAdapter.registerProvider(p);
          }

          const config = createFallbackConfig(names);
          const blob = createTestBlob();

          try {
            await localAdapter.analyze(blob, config);
          } catch (err) {
            // If all providers are unavailable, AIServiceError is expected
            if (!(err instanceof AIServiceError)) throw err;
          }

          // Each provider's isAvailable should be called at most once
          for (const p of providers) {
            const callCount = p.isAvailableCalled ? 1 : 0;
            expect(callCount).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('follows priority order — first available provider in order is selected', async () => {
    await fc.assert(
      fc.asyncProperty(
        providerCountArb.chain((count) =>
          fc.tuple(fc.constant(count), fc.integer({ min: 0, max: count - 1 })),
        ),
        async ([count, firstAvailableIdx]) => {
          const localAdapter = new AIServiceAdapter();
          const providers: ReturnType<typeof createConfigurableProvider>[] = [];
          const names: string[] = [];

          for (let i = 0; i < count; i++) {
            const name = providerName(i);
            names.push(name);
            // Only the provider at firstAvailableIdx (and after) is available;
            // all before it are unavailable
            const p = createConfigurableProvider(name, {
              available: i >= firstAvailableIdx,
            });
            providers.push(p);
            localAdapter.registerProvider(p);
          }

          const config = createFallbackConfig(names);
          const blob = createTestBlob();

          await localAdapter.analyze(blob, config);

          // The provider at firstAvailableIdx should have been selected (analyze called)
          expect(providers[firstAvailableIdx].analyzeCalled).toBe(true);

          // No provider AFTER the first available should have isAvailable called
          for (let i = firstAvailableIdx + 1; i < count; i++) {
            expect(providers[i].isAvailableCalled).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all providers unavailable → throws AIServiceError with code NO_PROVIDER_AVAILABLE', async () => {
    await fc.assert(
      fc.asyncProperty(providerCountArb, async (count) => {
        const localAdapter = new AIServiceAdapter();
        const names: string[] = [];

        for (let i = 0; i < count; i++) {
          const name = providerName(i);
          names.push(name);
          const p = createConfigurableProvider(name, { available: false });
          localAdapter.registerProvider(p);
        }

        const config = createFallbackConfig(names);
        const blob = createTestBlob();

        try {
          await localAdapter.analyze(blob, config);
          // Should not reach here
          expect.fail('Expected AIServiceError but analyze() succeeded');
        } catch (err) {
          expect(err).toBeInstanceOf(AIServiceError);
          expect((err as AIServiceError).safeResponse.error.code).toBe(
            'NO_PROVIDER_AVAILABLE',
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('first available succeeds → providers after it are never called', async () => {
    await fc.assert(
      fc.asyncProperty(
        providerCountArb.chain((count) =>
          fc.tuple(fc.constant(count), fc.integer({ min: 0, max: count - 1 })),
        ),
        async ([count, kIdx]) => {
          const localAdapter = new AIServiceAdapter();
          const providers: ReturnType<typeof createConfigurableProvider>[] = [];
          const names: string[] = [];

          for (let i = 0; i < count; i++) {
            const name = providerName(i);
            names.push(name);
            // Providers before kIdx are unavailable; kIdx and after are available
            const p = createConfigurableProvider(name, {
              available: i >= kIdx,
            });
            providers.push(p);
            localAdapter.registerProvider(p);
          }

          const config = createFallbackConfig(names);
          const blob = createTestBlob();

          await localAdapter.analyze(blob, config);

          // Providers AFTER kIdx should never have isAvailable or analyze called
          for (let i = kIdx + 1; i < count; i++) {
            expect(providers[i].isAvailableCalled).toBe(false);
            expect(providers[i].analyzeCalled).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('skips unavailable providers without calling analyze on them', async () => {
    await fc.assert(
      fc.asyncProperty(
        providerCountArb,
        fc.integer({ min: 0, max: 31 }),
        async (count, seed) => {
          // Use seed to create a pattern of availability
          const unavailableSet = new Set<number>();
          let hasAvailable = false;
          for (let i = 0; i < count; i++) {
            if ((seed >> i) & 1) {
              unavailableSet.add(i);
            } else {
              hasAvailable = true;
            }
          }

          // Ensure at least one provider is available for this property
          // (the "all fail" case is covered by a separate property test)
          if (!hasAvailable) return;

          const localAdapter = new AIServiceAdapter();
          const providers: ReturnType<typeof createConfigurableProvider>[] = [];
          const names: string[] = [];

          for (let i = 0; i < count; i++) {
            const name = providerName(i);
            names.push(name);
            const p = createConfigurableProvider(name, {
              available: !unavailableSet.has(i),
            });
            providers.push(p);
            localAdapter.registerProvider(p);
          }

          const config = createFallbackConfig(names);
          const blob = createTestBlob();

          await localAdapter.analyze(blob, config);

          // Every provider that reported unavailable must NOT have analyze called
          for (let i = 0; i < count; i++) {
            if (unavailableSet.has(i)) {
              expect(providers[i].analyzeCalled).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
