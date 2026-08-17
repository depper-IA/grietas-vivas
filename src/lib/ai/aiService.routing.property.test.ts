/**
 * Property-Based Test: Provider Routing by Key Presence (Property 13)
 *
 * **Validates: Requirements 7.2**
 *
 * For ANY analysis request, if a user API key is configured (BYOK), the system
 * must route to the BYOK provider; if no key is configured, it must route to
 * Fallback mode. The routing decision is deterministic and depends exclusively
 * on the presence/absence of the key.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { AIServiceAdapter } from './aiService';
import type { AIConfig, IAIProvider } from './types';

/** Valid JSON response that passes Zod validation */
const validResponseContent = JSON.stringify({
  riskLevel: 'medium',
  description: 'Visible crack detected in wall structure',
  confidence: 0.85,
});

/** Create a mock provider with call tracking */
function createTrackedProvider(name: string): IAIProvider {
  return {
    name,
    analyze: vi.fn().mockResolvedValue({ content: validResponseContent }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

/** Create a small valid image Blob for tests */
function createImageBlob(): Blob {
  const data = new Uint8Array(64);
  const blob = new Blob([data], { type: 'image/jpeg' });
  if (typeof blob.arrayBuffer !== 'function') {
    (blob as unknown as Record<string, unknown>).arrayBuffer = async () => data.buffer;
  }
  return blob;
}

/** Arbitrary for non-empty API key strings (BYOK scenario) */
const nonEmptyApiKeyArb = fc.string({ minLength: 1, maxLength: 128 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary for BYOK provider names */
const byokProviderArb = fc.constantFrom('anthropic' as const, 'openai' as const);

describe('Property 13: Provider Routing by Key Presence', () => {
  let adapter: AIServiceAdapter;
  let byokAnthropicProvider: IAIProvider;
  let byokOpenaiProvider: IAIProvider;
  let fallbackProvider1: IAIProvider;
  let fallbackProvider2: IAIProvider;

  beforeEach(() => {
    adapter = new AIServiceAdapter();

    byokAnthropicProvider = createTrackedProvider('anthropic');
    byokOpenaiProvider = createTrackedProvider('openai');
    fallbackProvider1 = createTrackedProvider('openrouter');
    fallbackProvider2 = createTrackedProvider('nvidia-nim');

    adapter.registerProvider(byokAnthropicProvider);
    adapter.registerProvider(byokOpenaiProvider);
    adapter.registerProvider(fallbackProvider1);
    adapter.registerProvider(fallbackProvider2);
  });

  it('non-empty apiKey always routes to the BYOK provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyApiKeyArb,
        byokProviderArb,
        async (apiKey, providerName) => {
          // Reset mocks for each iteration
          const providers = {
            anthropic: byokAnthropicProvider,
            openai: byokOpenaiProvider,
          };
          vi.mocked(providers[providerName].analyze).mockClear();
          vi.mocked(fallbackProvider1.analyze).mockClear();
          vi.mocked(fallbackProvider2.analyze).mockClear();

          const config: AIConfig = {
            mode: 'byok',
            byok: { provider: providerName, apiKey },
            fallbackPriority: ['openrouter', 'nvidia-nim'],
          };

          const result = await adapter.analyze(createImageBlob(), config);

          // The selected BYOK provider must be called
          expect(providers[providerName].analyze).toHaveBeenCalledOnce();
          expect(result.provider).toBe(providerName);

          // Fallback providers must NOT be called
          expect(fallbackProvider1.analyze).not.toHaveBeenCalled();
          expect(fallbackProvider2.analyze).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('empty apiKey always routes to fallback providers', async () => {
    await fc.assert(
      fc.asyncProperty(
        byokProviderArb,
        async (providerName) => {
          // Reset mocks
          vi.mocked(byokAnthropicProvider.analyze).mockClear();
          vi.mocked(byokOpenaiProvider.analyze).mockClear();
          vi.mocked(fallbackProvider1.analyze).mockClear();
          vi.mocked(fallbackProvider1.isAvailable).mockClear();

          const config: AIConfig = {
            mode: 'byok',
            byok: { provider: providerName, apiKey: '' },
            fallbackPriority: ['openrouter', 'nvidia-nim'],
          };

          const result = await adapter.analyze(createImageBlob(), config);

          // BYOK providers must NOT be called
          expect(byokAnthropicProvider.analyze).not.toHaveBeenCalled();
          expect(byokOpenaiProvider.analyze).not.toHaveBeenCalled();

          // Fallback provider must be used
          expect(result.provider).toBe('openrouter');
          expect(fallbackProvider1.analyze).toHaveBeenCalledOnce();
        },
      ),
      { numRuns: 20 },
    );
  });

  it('routing is deterministic — same config always routes to the same provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // BYOK config with key
          fc.record({
            mode: fc.constant('byok' as const),
            byok: fc.record({
              provider: byokProviderArb,
              apiKey: nonEmptyApiKeyArb,
            }),
            fallbackPriority: fc.constant(['openrouter', 'nvidia-nim']),
          }),
          // Fallback config (no key)
          fc.record({
            mode: fc.constant('fallback' as const),
            fallbackPriority: fc.constant(['openrouter', 'nvidia-nim']),
          }),
        ),
        async (config) => {
          // Call analyze twice with the same config
          const result1 = await adapter.analyze(createImageBlob(), config);
          const result2 = await adapter.analyze(createImageBlob(), config);

          // Must route to the same provider every time
          expect(result1.provider).toBe(result2.provider);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('BYOK mode never calls isAvailable on the BYOK provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyApiKeyArb,
        byokProviderArb,
        async (apiKey, providerName) => {
          const providers = {
            anthropic: byokAnthropicProvider,
            openai: byokOpenaiProvider,
          };
          vi.mocked(providers[providerName].isAvailable).mockClear();

          const config: AIConfig = {
            mode: 'byok',
            byok: { provider: providerName, apiKey },
            fallbackPriority: ['openrouter', 'nvidia-nim'],
          };

          await adapter.analyze(createImageBlob(), config);

          // isAvailable must NOT be called in BYOK mode
          expect(providers[providerName].isAvailable).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('fallback mode always checks isAvailable on fallback providers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          vi.mocked(fallbackProvider1.isAvailable).mockClear();

          const config: AIConfig = {
            mode: 'fallback',
            fallbackPriority: ['openrouter', 'nvidia-nim'],
          };

          await adapter.analyze(createImageBlob(), config);

          // isAvailable must be called on the first fallback provider
          expect(fallbackProvider1.isAvailable).toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  });
});
