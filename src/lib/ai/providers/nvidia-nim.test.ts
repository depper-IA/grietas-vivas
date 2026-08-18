/**
 * NVIDIA NIM Provider — Unit Tests
 *
 * Tests:
 * - Model discovery via /v1/models endpoint
 * - Vision model filter (excludes text-only models)
 * - Multi-model fallback chain
 * - 15s timeout per request
 * - Rate limit, auth, server errors
 * - isAvailable behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NvidiaNimProvider } from './nvidia-nim';
import type { AnalysisPayload } from '../types';

/** Helper to create a minimal analysis payload. */
function createPayload(): AnalysisPayload {
  return {
    image: Buffer.from('fake-image-data'),
    prompt: 'Analyze this crack',
    maxTokens: 1024,
  };
}

/** Successful NIM chat completions response. */
function createSuccessResponse(content = '{"riskLevel":"high","description":"x","confidence":0.9}') {
  return { choices: [{ message: { content } }], model: 'test-model', usage: {} };
}

/** Models list response. */
function createModelsList(models: string[]) {
  return { data: models.map((id) => ({ id })) };
}

describe('NvidiaNimProvider', () => {
  let provider: NvidiaNimProvider;
  const mockFetch = vi.fn();

  beforeEach(() => {
    provider = new NvidiaNimProvider('nvapi-test-key');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    // Mock the /v1/models endpoint by default with a known set of vision models
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/v1/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => createModelsList([
            'meta/llama-3.2-90b-vision-instruct',     // vision
            'meta/llama-3.2-11b-vision-instruct',     // vision (our default)
            'nvidia/neva-22b',                        // vision
            'microsoft/phi-3.5-vision-instruct',     // vision
            'mistralai/pixtral-12b-2409',            // vision
            'google/gemma-3-27b-it',                 // vision
            'meta/llama-3.1-8b-instruct',            // text-only (filter out)
            'mistralai/mistral-7b-instruct',         // text-only (filter out)
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => createSuccessResponse(),
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has name "nvidia-nim"', () => {
    expect(provider.name).toBe('nvidia-nim');
  });

  describe('model discovery', () => {
    it('filtra a modelos vision/multimodal', async () => {
      const models = await provider.getVisionModels();
      // Text-only excluded
      expect(models).not.toContain('meta/llama-3.1-8b-instruct');
      expect(models).not.toContain('mistralai/mistral-7b-instruct');
      // Vision included
      expect(models).toContain('meta/llama-3.2-90b-vision-instruct');
      expect(models).toContain('nvidia/neva-22b');
      expect(models).toContain('microsoft/phi-3.5-vision-instruct');
      expect(models).toContain('mistralai/pixtral-12b-2409');
    });

    it('cachea el resultado por 1 hora', async () => {
      // Primera llamada — debe hacer fetch
      await provider.getVisionModels();
      const callsAfterFirst = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/v1/models'),
      ).length;
      expect(callsAfterFirst).toBe(1);

      // Segunda llamada — debe usar cache
      await provider.getVisionModels();
      const callsAfterSecond = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/v1/models'),
      ).length;
      expect(callsAfterSecond).toBe(1); // sin nueva llamada
    });

    it('deduplica fetches concurrentes', async () => {
      // Llama getVisionModels 3 veces en paralelo
      const [a, b, c] = await Promise.all([
        provider.getVisionModels(),
        provider.getVisionModels(),
        provider.getVisionModels(),
      ]);
      // Todas deben resolver a la misma lista
      expect(a).toEqual(b);
      expect(b).toEqual(c);
      // Solo 1 fetch al endpoint /v1/models
      const modelCalls = mockFetch.mock.calls.filter((c) => c[0].includes('/v1/models'));
      expect(modelCalls.length).toBe(1);
    });
  });

  describe('analyze — successful response', () => {
    it('envia formato correcto con un modelo vision disponible', async () => {
      const result = await provider.analyze(createPayload());

      // Debe llamar al endpoint de chat (no al de modelos en este analyze,
      // porque ya cacheo la lista en beforeEach)
      const chatCalls = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/v1/chat/completions'),
      );
      expect(chatCalls.length).toBe(1);

      const [, options] = chatCalls[0];
      const body = JSON.parse(options.body);
      expect(body.messages[0].content[1].image_url.url).toMatch(
        /^data:image\/jpeg;base64,/,
      );
      expect(body.max_tokens).toBe(1024);

      expect(result.metadata?.provider).toBe('nvidia-nim');
      // El modelo deberia ser uno de los vision disponibles
      expect([
        'meta/llama-3.2-90b-vision-instruct',
        'meta/llama-3.2-11b-vision-instruct',
        'nvidia/neva-22b',
        'microsoft/phi-3.5-vision-instruct',
        'mistralai/pixtral-12b-2409',
        'google/gemma-3-27b-it',
      ]).toContain(result.metadata?.model);
    });

    it('envuelve la imagen como data URL base64', async () => {
      const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic
      await provider.analyze({ image: imageData, prompt: 'x', maxTokens: 512 });

      const chatCall = mockFetch.mock.calls.find((c) =>
        c[0].includes('/v1/chat/completions'),
      );
      const body = JSON.parse(chatCall![1].body);
      const expectedBase64 = imageData.toString('base64');
      expect(body.messages[0].content[1].image_url.url).toBe(
        `data:image/jpeg;base64,${expectedBase64}`,
      );
    });
  });

  describe('analyze — fallback chain (multi-modelo)', () => {
    it('prueba siguiente modelo si el primero falla con 404', async () => {
      // Primer modelo (90B) -> 404
      // Segundo modelo (11B) -> 200 OK
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList([
              'meta/llama-3.2-90b-vision-instruct',
              'meta/llama-3.2-11b-vision-instruct',
            ]),
          });
        }
        // Primer llamada (90B) -> 404
        // Segunda llamada (11B) -> 200
        const callCount = mockFetch.mock.calls.filter((c) =>
          c[0].includes('/v1/chat/completions'),
        ).length;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => createSuccessResponse() });
      });

      const result = await provider.analyze(createPayload());
      expect(result.metadata?.model).toBe('meta/llama-3.2-11b-vision-instruct');

      // 2 chat calls: una fallida (404) + una exitosa (200)
      const chatCalls = mockFetch.mock.calls.filter((c) =>
        c[0].includes('/v1/chat/completions'),
      );
      expect(chatCalls.length).toBe(2);
    });

    it('intenta con todos los modelos si todos fallan', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList([
              'meta/llama-3.2-11b-vision-instruct',
              'nvidia/neva-22b',
            ]),
          });
        }
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/all 2 models failed/);
    });
  });

  describe('analyze — timeout (15s)', () => {
    it('throws error with "timeout" cuando fetch hace AbortError', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList(['meta/llama-3.2-11b-vision-instruct']),
          });
        }
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/timeout/i);
    });
  });

  describe('analyze — error categorization', () => {
    it('clasifica 429 como rate limit', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList(['meta/llama-3.2-11b-vision-instruct']),
          });
        }
        return Promise.resolve({ ok: false, status: 429, json: async () => ({}) });
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/429/);
    });

    it('clasifica 401 como auth error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList(['meta/llama-3.2-11b-vision-instruct']),
          });
        }
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/401/);
    });
  });

  describe('analyze — fallback hardcodeado', () => {
    it('usa modelos hardcodeados si /v1/models falla', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          // La API de modelos falla (red, 500, etc.)
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
        }
        // Los modelos hardcodeados son intentados. El primero responde OK.
        return Promise.resolve({ ok: true, status: 200, json: async () => createSuccessResponse() });
      });

      const result = await provider.analyze(createPayload());
      expect(result.metadata?.provider).toBe('nvidia-nim');
    });
  });

  describe('analyze — empty response', () => {
    it('handles empty choices array gracefully', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => createModelsList(['meta/llama-3.2-11b-vision-instruct']),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [] }) });
      });

      const result = await provider.analyze(createPayload());
      expect(result.content).toBe('');
    });
  });

  describe('isAvailable', () => {
    it('returns true cuando la API key esta configurada', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false cuando la API key esta vacia', async () => {
      const empty = new NvidiaNimProvider('');
      expect(await empty.isAvailable()).toBe(false);
    });
  });
});