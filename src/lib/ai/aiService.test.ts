/**
 * AI Service Adapter — Unit Tests
 *
 * Tests the Strategy pattern routing, provider registration,
 * response validation, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIServiceAdapter, AIServiceError } from './aiService';
import type { AIConfig, IAIProvider, AnalysisPayload, RawProviderResponse } from './types';

/** Helper to create a mock provider */
function createMockProvider(
  name: string,
  options: {
    available?: boolean;
    response?: RawProviderResponse;
    error?: Error;
  } = {},
): IAIProvider {
  const { available = true, response, error } = options;

  return {
    name,
    analyze: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue(
          response ?? {
            content: JSON.stringify({
              riskLevel: 'medium',
              description: 'Visible crack in wall',
              confidence: 0.85,
            }),
          },
        ),
    isAvailable: vi.fn().mockResolvedValue(available),
  };
}

/** Helper to create a valid Blob of given size with arrayBuffer support */
function createImageBlob(sizeBytes: number = 1024): Blob {
  const data = new Uint8Array(sizeBytes);
  const blob = new Blob([data], { type: 'image/jpeg' });

  // jsdom Blob may not implement arrayBuffer(), polyfill if missing
  if (typeof blob.arrayBuffer !== 'function') {
    (blob as unknown as Record<string, unknown>).arrayBuffer = async () => data.buffer;
  }

  return blob;
}

describe('AIServiceAdapter', () => {
  let adapter: AIServiceAdapter;

  beforeEach(() => {
    adapter = new AIServiceAdapter();
  });

  describe('registerProvider', () => {
    it('registers a provider and makes it available', () => {
      const provider = createMockProvider('anthropic');
      adapter.registerProvider(provider);

      expect(adapter.getAvailableProviders()).toContain('anthropic');
    });

    it('supports registering multiple providers', () => {
      adapter.registerProvider(createMockProvider('anthropic'));
      adapter.registerProvider(createMockProvider('openai'));
      adapter.registerProvider(createMockProvider('openrouter'));

      const providers = adapter.getAvailableProviders();
      expect(providers).toHaveLength(3);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('openrouter');
    });

    it('overwrites provider with same name on re-registration', () => {
      adapter.registerProvider(createMockProvider('anthropic'));
      adapter.registerProvider(createMockProvider('anthropic'));

      expect(adapter.getAvailableProviders()).toHaveLength(1);
    });
  });

  describe('getAvailableProviders', () => {
    it('returns empty array when no providers registered', () => {
      expect(adapter.getAvailableProviders()).toEqual([]);
    });
  });

  describe('analyze — BYOK mode', () => {
    const byokConfig: AIConfig = {
      mode: 'byok',
      byok: { provider: 'anthropic', apiKey: 'sk-test-key' },
      fallbackPriority: [],
    };

    it('routes to the BYOK provider when apiKey is present', async () => {
      const provider = createMockProvider('anthropic');
      adapter.registerProvider(provider);

      const result = await adapter.analyze(createImageBlob(), byokConfig);

      expect(provider.analyze).toHaveBeenCalledOnce();
      expect(result.provider).toBe('anthropic');
      expect(result.riskLevel).toBe('medium');
    });

    it('throws PROVIDER_NOT_FOUND when BYOK provider is not registered', async () => {
      await expect(
        adapter.analyze(createImageBlob(), byokConfig),
      ).rejects.toThrow(AIServiceError);

      try {
        await adapter.analyze(createImageBlob(), byokConfig);
      } catch (err) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect((err as AIServiceError).safeResponse.error.code).toBe('PROVIDER_NOT_FOUND');
      }
    });

    it('does not call isAvailable for BYOK provider', async () => {
      const provider = createMockProvider('anthropic');
      adapter.registerProvider(provider);

      await adapter.analyze(createImageBlob(), byokConfig);

      expect(provider.isAvailable).not.toHaveBeenCalled();
    });
  });

  describe('analyze — Fallback mode', () => {
    const fallbackConfig: AIConfig = {
      mode: 'fallback',
      fallbackPriority: ['openrouter', 'nvidia-nim'],
    };

    it('routes to the first available fallback provider', async () => {
      const openrouter = createMockProvider('openrouter', { available: true });
      const nvidia = createMockProvider('nvidia-nim', { available: true });
      adapter.registerProvider(openrouter);
      adapter.registerProvider(nvidia);

      const result = await adapter.analyze(createImageBlob(), fallbackConfig);

      expect(openrouter.analyze).toHaveBeenCalledOnce();
      expect(nvidia.analyze).not.toHaveBeenCalled();
      expect(result.provider).toBe('openrouter');
    });

    it('skips unavailable providers and uses next in priority', async () => {
      const openrouter = createMockProvider('openrouter', { available: false });
      const nvidia = createMockProvider('nvidia-nim', { available: true });
      adapter.registerProvider(openrouter);
      adapter.registerProvider(nvidia);

      const result = await adapter.analyze(createImageBlob(), fallbackConfig);

      expect(openrouter.analyze).not.toHaveBeenCalled();
      expect(nvidia.analyze).toHaveBeenCalledOnce();
      expect(result.provider).toBe('nvidia-nim');
    });

    it('skips providers whose availability check throws', async () => {
      const openrouter: IAIProvider = {
        name: 'openrouter',
        analyze: vi.fn(),
        isAvailable: vi.fn().mockRejectedValue(new Error('network error')),
      };
      const nvidia = createMockProvider('nvidia-nim', { available: true });
      adapter.registerProvider(openrouter);
      adapter.registerProvider(nvidia);

      const result = await adapter.analyze(createImageBlob(), fallbackConfig);

      expect(result.provider).toBe('nvidia-nim');
    });

    it('throws NO_PROVIDER_AVAILABLE when all fallback providers unavailable', async () => {
      adapter.registerProvider(createMockProvider('openrouter', { available: false }));
      adapter.registerProvider(createMockProvider('nvidia-nim', { available: false }));

      await expect(
        adapter.analyze(createImageBlob(), fallbackConfig),
      ).rejects.toThrow(AIServiceError);

      try {
        await adapter.analyze(createImageBlob(), fallbackConfig);
      } catch (err) {
        expect((err as AIServiceError).safeResponse.error.code).toBe('NO_PROVIDER_AVAILABLE');
      }
    });

    it('throws NO_PROVIDER_AVAILABLE when fallbackPriority references unregistered providers', async () => {
      // No providers registered at all
      await expect(
        adapter.analyze(createImageBlob(), fallbackConfig),
      ).rejects.toThrow(AIServiceError);
    });

    it('falls back to fallback mode when BYOK mode has no apiKey', async () => {
      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: '' },
        fallbackPriority: ['openrouter'],
      };
      const openrouter = createMockProvider('openrouter', { available: true });
      adapter.registerProvider(openrouter);

      const result = await adapter.analyze(createImageBlob(), config);

      expect(result.provider).toBe('openrouter');
    });
  });

  describe('analyze — image size validation', () => {
    it('rejects images larger than 10 MB', async () => {
      const largeBlob = createImageBlob(10 * 1024 * 1024 + 1);
      adapter.registerProvider(createMockProvider('anthropic'));

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      await expect(adapter.analyze(largeBlob, config)).rejects.toThrow(AIServiceError);

      try {
        await adapter.analyze(largeBlob, config);
      } catch (err) {
        expect((err as AIServiceError).safeResponse.error.code).toBe('IMAGE_TOO_LARGE');
      }
    });

    it('accepts images exactly at 10 MB', async () => {
      const exactBlob = createImageBlob(10 * 1024 * 1024);
      const provider = createMockProvider('anthropic');
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      const result = await adapter.analyze(exactBlob, config);
      expect(result.riskLevel).toBe('medium');
    });

    it('rejects context image larger than 10 MB', async () => {
      const normalBlob = createImageBlob(1024);
      const largeContextBlob = createImageBlob(10 * 1024 * 1024 + 1);
      adapter.registerProvider(createMockProvider('anthropic'));

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      await expect(
        adapter.analyze(normalBlob, config, { contextImage: largeContextBlob }),
      ).rejects.toThrow(AIServiceError);
    });
  });

  describe('analyze — multimodal & structural context options', () => {
    it('passes contextImage and structuralContext in payload to provider', async () => {
      const mockProvider = createMockProvider('anthropic');
      adapter.registerProvider(mockProvider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      const detailBlob = createImageBlob(500);
      const contextBlob = createImageBlob(800);
      const structuralContext = {
        elementType: 'column' as const,
        crossesFullSpan: true,
        hasScaleReference: true,
        scaleReferenceType: 'coin' as const,
        recentGrowth: true,
      };

      await adapter.analyze(detailBlob, config, {
        contextImage: contextBlob,
        structuralContext,
      });

      expect(mockProvider.analyze).toHaveBeenCalledOnce();
      const payload: AnalysisPayload = (mockProvider.analyze as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(payload.image).toBeDefined();
      expect(payload.contextImage).toBeDefined();
      expect(payload.structuralContext).toEqual(structuralContext);
      expect(payload.prompt).toContain('NSR-10 Colombia / FEMA 306');
      expect(payload.prompt).toContain('FOTOGRAFÍAS ADJUNTAS PARA EL ANÁLISIS MULTIMODAL');
    });

    it('applies structural rules to adjust result when structuralContext is provided', async () => {
      const mockProvider = createMockProvider('anthropic', {
        response: {
          content: JSON.stringify({
            riskLevel: 'medium',
            description: 'Grieta diagonal en columna',
            confidence: 0.85,
            crackType: 'shear',
            crossesFullSpan: true,
          }),
        },
      });
      adapter.registerProvider(mockProvider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      const result = await adapter.analyze(createImageBlob(), config, {
        structuralContext: {
          elementType: 'column',
          crossesFullSpan: true,
          hasScaleReference: false,
          recentGrowth: false,
        },
      });

      // Escalated to critical by rule engine
      expect(result.riskLevel).toBe('critical');
      expect(result.description).toContain('[Nota: Nivel de riesgo ajustado de "medium" a "critical"');
    });
  });

  describe('analyze — response validation', () => {
    it('validates and returns a correct response', async () => {
      const provider = createMockProvider('anthropic', {
        response: {
          content: JSON.stringify({
            riskLevel: 'critical',
            description: 'Severe structural crack indicating imminent collapse risk',
            confidence: 0.95,
          }),
        },
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      const result = await adapter.analyze(createImageBlob(), config);

      expect(result.riskLevel).toBe('critical');
      expect(result.description).toBe('Severe structural crack indicating imminent collapse risk');
      expect(result.confidence).toBe(0.95);
      expect(result.provider).toBe('anthropic');
      expect(result.analyzedAt).toBeDefined();
    });

    it('rejects response with invalid riskLevel', async () => {
      const provider = createMockProvider('anthropic', {
        response: {
          content: JSON.stringify({
            riskLevel: 'extreme', // invalid
            description: 'Bad crack',
            confidence: 0.8,
          }),
        },
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      try {
        await adapter.analyze(createImageBlob(), config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect((err as AIServiceError).safeResponse.error.code).toBe('RESPONSE_VALIDATION_ERROR');
        expect((err as AIServiceError).safeResponse.error.fields).toBeDefined();
      }
    });

    it('rejects response with confidence out of range', async () => {
      const provider = createMockProvider('anthropic', {
        response: {
          content: JSON.stringify({
            riskLevel: 'low',
            description: 'Minor crack',
            confidence: 1.5, // out of range
          }),
        },
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      await expect(adapter.analyze(createImageBlob(), config)).rejects.toThrow(AIServiceError);
    });

    it('rejects non-JSON response', async () => {
      const provider = createMockProvider('anthropic', {
        response: { content: 'This is not JSON at all' },
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      try {
        await adapter.analyze(createImageBlob(), config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect((err as AIServiceError).safeResponse.error.code).toBe('RESPONSE_PARSE_ERROR');
      }
    });

    it('rejects response with description exceeding 2000 characters', async () => {
      const provider = createMockProvider('anthropic', {
        response: {
          content: JSON.stringify({
            riskLevel: 'high',
            description: 'x'.repeat(2001),
            confidence: 0.7,
          }),
        },
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      await expect(adapter.analyze(createImageBlob(), config)).rejects.toThrow(AIServiceError);
    });
  });

  describe('analyze — provider errors', () => {
    it('wraps provider errors as PROVIDER_ERROR', async () => {
      const provider = createMockProvider('anthropic', {
        error: new Error('Request timed out'),
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'key' },
        fallbackPriority: [],
      };

      try {
        await adapter.analyze(createImageBlob(), config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect((err as AIServiceError).safeResponse.error.code).toBe('PROVIDER_ERROR');
        expect((err as AIServiceError).safeResponse.error.message).toContain('timeout');
      }
    });

    it('categorizes authentication errors', async () => {
      const provider = createMockProvider('anthropic', {
        error: new Error('401 Unauthorized'),
      });
      adapter.registerProvider(provider);

      const config: AIConfig = {
        mode: 'byok',
        byok: { provider: 'anthropic', apiKey: 'bad-key' },
        fallbackPriority: [],
      };

      try {
        await adapter.analyze(createImageBlob(), config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as AIServiceError).safeResponse.error.message).toContain('authentication_error');
      }
    });
  });

  describe('AIServiceError', () => {
    it('produces a SafeErrorResponse structure', () => {
      const err = new AIServiceError('TEST_CODE', 'test message', { field: 'bad' });

      expect(err.safeResponse).toEqual({
        error: {
          code: 'TEST_CODE',
          message: 'test message',
          fields: { field: 'bad' },
        },
      });
      expect(err.name).toBe('AIServiceError');
    });
  });
});
