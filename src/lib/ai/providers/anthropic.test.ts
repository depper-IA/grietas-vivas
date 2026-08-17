/**
 * Anthropic BYOK Provider — Unit Tests
 *
 * Tests request construction, timeout handling, auth error handling,
 * and response parsing for the Anthropic Messages API provider.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicProvider, createAnthropicProvider } from './anthropic';
import type { AnalysisPayload } from '../types';

/** Create a standard test payload */
function createPayload(overrides: Partial<AnalysisPayload> = {}): AnalysisPayload {
  return {
    image: Buffer.from('fake-image-data'),
    prompt: 'Analyze this crack',
    maxTokens: 1024,
    ...overrides,
  };
}

/** Create a successful Anthropic API response */
function createSuccessResponse(content: string = '{"riskLevel":"medium","description":"Crack found","confidence":0.8}') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: content }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'end_turn',
    }),
  } as unknown as Response;
}

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new AnthropicProvider('sk-test-key-123');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constructor and metadata', () => {
    it('has name "anthropic"', () => {
      expect(provider.name).toBe('anthropic');
    });

    it('isAvailable always returns true for BYOK providers', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('createAnthropicProvider factory', () => {
    it('creates a provider instance with the given key', () => {
      const p = createAnthropicProvider('sk-factory-key');
      expect(p).toBeInstanceOf(AnthropicProvider);
      expect(p.name).toBe('anthropic');
    });
  });

  describe('analyze — successful request', () => {
    it('sends correct request structure to Anthropic API', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const payload = createPayload();

      await provider.analyze(payload);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(options.method).toBe('POST');
      expect(options.headers['x-api-key']).toBe('sk-test-key-123');
      expect(options.headers['anthropic-version']).toBe('2023-06-01');
      expect(options.headers['content-type']).toBe('application/json');
    });

    it('sends image as base64 in the request body', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const imageData = Buffer.from('test-image-bytes');
      const payload = createPayload({ image: imageData });

      await provider.analyze(payload);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageBlock = body.messages[0].content[0];

      expect(imageBlock.type).toBe('image');
      expect(imageBlock.source.type).toBe('base64');
      expect(imageBlock.source.media_type).toBe('image/jpeg');
      expect(imageBlock.source.data).toBe(imageData.toString('base64'));
    });

    it('includes prompt as text block after image', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const payload = createPayload({ prompt: 'Custom prompt text' });

      await provider.analyze(payload);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const textBlock = body.messages[0].content[1];

      expect(textBlock.type).toBe('text');
      expect(textBlock.text).toBe('Custom prompt text');
    });

    it('sets max_tokens from payload', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const payload = createPayload({ maxTokens: 2048 });

      await provider.analyze(payload);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(2048);
    });

    it('returns parsed content and metadata', async () => {
      const responseContent = '{"riskLevel":"high","description":"Severe crack","confidence":0.95}';
      fetchMock.mockResolvedValue(createSuccessResponse(responseContent));

      const result = await provider.analyze(createPayload());

      expect(result.content).toBe(responseContent);
      expect(result.metadata).toEqual({
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 100, output_tokens: 50 },
        stopReason: 'end_turn',
      });
    });

    it('returns empty string if no text block in response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          content: [],
          model: 'claude-sonnet-4-20250514',
          usage: {},
          stop_reason: 'end_turn',
        }),
      } as unknown as Response);

      const result = await provider.analyze(createPayload());
      expect(result.content).toBe('');
    });
  });

  describe('analyze — authentication errors', () => {
    it('throws descriptive error on 401 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        /authentication failed.*401/i,
      );
    });

    it('throws descriptive error on 403 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        /authentication failed.*403/i,
      );
    });

    it('includes guidance to verify API key in auth error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        /verify your API key/i,
      );
    });
  });

  describe('analyze — rate limiting', () => {
    it('throws descriptive error on 429 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        /rate limit.*429/i,
      );
    });
  });

  describe('analyze — generic API errors', () => {
    it('throws error with status code for other HTTP errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        /Anthropic API error.*500/,
      );
    });
  });

  describe('analyze — timeout handling', () => {
    it('aborts request after 60 seconds and throws timeout error', async () => {
      vi.useFakeTimers();

      fetchMock.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );

      const promise = provider.analyze(createPayload());
      vi.advanceTimersByTime(60_000);

      await expect(promise).rejects.toThrow(/timed out.*60 seconds/i);

      vi.useRealTimers();
    });

    it('passes AbortSignal to fetch', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());

      await provider.analyze(createPayload());

      const options = fetchMock.mock.calls[0][1];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('analyze — network errors', () => {
    it('propagates network errors without wrapping', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(provider.analyze(createPayload())).rejects.toThrow('Failed to fetch');
    });
  });
});
