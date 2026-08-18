/**
 * OpenAI BYOK Provider — Unit Tests
 *
 * Tests request construction, timeout handling, auth error handling,
 * and response parsing for the OpenAI Chat Completions API provider.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider, createOpenAIProvider } from './openai';
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

/** Create a successful OpenAI API response */
function createSuccessResponse(content: string = '{"riskLevel":"medium","description":"Crack found","confidence":0.8}') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4o',
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    }),
  } as unknown as Response;
}

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new OpenAIProvider('sk-openai-test-key-123');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constructor and metadata', () => {
    it('has name "openai"', () => {
      expect(provider.name).toBe('openai');
    });

    it('isAvailable always returns true for BYOK providers', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('createOpenAIProvider factory', () => {
    it('creates a provider instance with the given key', () => {
      const p = createOpenAIProvider('sk-factory-key');
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.name).toBe('openai');
    });
  });

  describe('analyze — successful request', () => {
    it('sends correct request structure to OpenAI API', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const payload = createPayload();

      await provider.analyze(payload);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer sk-openai-test-key-123');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('sends image as base64 data URL in the request body', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const imageData = Buffer.from('test-image-bytes');
      const payload = createPayload({ image: imageData });

      await provider.analyze(payload);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageBlock = body.messages[0].content[0];

      expect(imageBlock.type).toBe('image_url');
      expect(imageBlock.image_url.url).toBe(
        `data:image/jpeg;base64,${imageData.toString('base64')}`,
      );
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

    it('uses gpt-4o model', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());

      await provider.analyze(createPayload());

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4o');
    });

    it('returns parsed content and metadata', async () => {
      const responseContent = '{"riskLevel":"high","description":"Severe crack","confidence":0.95}';
      fetchMock.mockResolvedValue(createSuccessResponse(responseContent));

      const result = await provider.analyze(createPayload());

      expect(result.content).toBe(responseContent);
      expect(result.metadata).toEqual({
        model: 'gpt-4o',
        usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
        finishReason: 'stop',
      });
    });

    it('includes second image when contextImage is provided', async () => {
      fetchMock.mockResolvedValue(createSuccessResponse());
      const image1 = Buffer.from('image-1-bytes');
      const image2 = Buffer.from('image-2-bytes');
      const payload = createPayload({ image: image1, contextImage: image2 });

      await provider.analyze(payload);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const content = body.messages[0].content;

      expect(content).toHaveLength(3);
      expect(content[0].type).toBe('image_url');
      expect(content[0].image_url.url).toBe(`data:image/jpeg;base64,${image1.toString('base64')}`);
      expect(content[1].type).toBe('image_url');
      expect(content[1].image_url.url).toBe(`data:image/jpeg;base64,${image2.toString('base64')}`);
      expect(content[2].type).toBe('text');
    });

    it('returns empty string if no choices in response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [],
          model: 'gpt-4o',
          usage: {},
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
        /OpenAI API error.*500/,
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
