/**
 * NVIDIA NIM Provider — Unit Tests
 *
 * Tests successful response parsing, 15-second timeout enforcement,
 * rate-limit (429) handling, auth errors, and isAvailable behavior.
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

/** Helper to create a successful NVIDIA NIM API response body. */
function createSuccessResponse(content: string = '{"riskLevel":"high","description":"Severe crack","confidence":0.9}') {
  return {
    choices: [{ message: { content } }],
    model: 'meta/llama-3.2-90b-vision-instruct',
    usage: { prompt_tokens: 200, completion_tokens: 80 },
  };
}

describe('NvidiaNimProvider', () => {
  let provider: NvidiaNimProvider;
  const mockFetch = vi.fn();

  beforeEach(() => {
    provider = new NvidiaNimProvider('nvapi-test-key');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('constructor and metadata', () => {
    it('has name "nvidia-nim"', () => {
      expect(provider.name).toBe('nvidia-nim');
    });
  });

  describe('analyze — successful response', () => {
    it('sends correct request format and parses response', async () => {
      const responseBody = createSuccessResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseBody,
      });

      const result = await provider.analyze(createPayload());

      // Verify fetch was called with correct URL and headers
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer nvapi-test-key');
      expect(options.headers['Content-Type']).toBe('application/json');

      // Verify body structure
      const body = JSON.parse(options.body);
      expect(body.model).toBe('meta/llama-3.2-90b-vision-instruct');
      expect(body.max_tokens).toBe(1024);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0].type).toBe('text');
      expect(body.messages[0].content[1].type).toBe('image_url');
      expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

      // Verify response parsing
      expect(result.content).toBe('{"riskLevel":"high","description":"Severe crack","confidence":0.9}');
      expect(result.metadata?.provider).toBe('nvidia-nim');
      expect(result.metadata?.model).toBe('meta/llama-3.2-90b-vision-instruct');
    });

    it('sends image as base64 data URL', async () => {
      const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic bytes
      const payload: AnalysisPayload = {
        image: imageData,
        prompt: 'Test prompt',
        maxTokens: 512,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => createSuccessResponse(),
      });

      await provider.analyze(payload);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const expectedBase64 = imageData.toString('base64');
      expect(body.messages[0].content[1].image_url.url).toBe(`data:image/jpeg;base64,${expectedBase64}`);
    });
  });

  describe('analyze — timeout (15s)', () => {
    it('throws error with "timeout" when AbortController fires', async () => {
      // Simulate the AbortError that fetch throws when signal is aborted
      mockFetch.mockImplementationOnce(async (_url: string, _options: RequestInit) => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        throw abortError;
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/timeout/i);
    });

    it('passes AbortSignal to fetch for timeout enforcement', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => createSuccessResponse(),
      });

      await provider.analyze(createPayload());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('analyze — rate-limit (429)', () => {
    it('throws error containing "429" on rate-limit response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/429/);
    });
  });

  describe('analyze — authentication errors', () => {
    it('throws error containing "401" on unauthorized response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/401/);
    });

    it('throws error containing status on 403 forbidden', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/403/);
    });
  });

  describe('analyze — other errors', () => {
    it('throws on 500 server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(/500/);
    });

    it('handles empty choices array gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [], model: 'test' }),
      });

      const result = await provider.analyze(createPayload());
      expect(result.content).toBe('');
    });
  });

  describe('isAvailable', () => {
    it('returns true when API key is configured', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when API key is empty', async () => {
      const emptyProvider = new NvidiaNimProvider('');
      const available = await emptyProvider.isAvailable();
      expect(available).toBe(false);
    });
  });
});
