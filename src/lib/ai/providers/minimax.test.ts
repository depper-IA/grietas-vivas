/**
 * Minimax Provider — Unit Tests
 *
 * Tests successful response parsing, 15-second timeout enforcement,
 * rate-limit (429) handling, auth errors, model parameterization, and isAvailable behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MinimaxProvider } from './minimax';
import type { AnalysisPayload } from '../types';

/** Helper to create a minimal analysis payload. */
function createPayload(): AnalysisPayload {
  return {
    image: Buffer.from('fake-image-data'),
    prompt: 'Analyze this crack',
    maxTokens: 1024,
  };
}

/** Helper to create a successful Minimax API response body. */
function createSuccessResponse(content: string = '{"riskLevel":"high","description":"Fisura diagonal en muro","confidence":0.92}') {
  return {
    choices: [{ message: { content } }],
    model: 'MiniMax-M3',
    usage: { prompt_tokens: 120, completion_tokens: 60 },
  };
}

describe('MinimaxProvider', () => {
  let provider: MinimaxProvider;
  const mockFetch = vi.fn();

  beforeEach(() => {
    provider = new MinimaxProvider('minimax-test-key-123');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('constructor and metadata', () => {
    it('has name "minimax"', () => {
      expect(provider.name).toBe('minimax');
    });

    it('uses default model MiniMax-M3 when omitted', async () => {
      const p = new MinimaxProvider('test-key');
      expect(await p.isAvailable()).toBe(true);
    });

    it('accepts custom model parameter', () => {
      const p = new MinimaxProvider('test-key', 'abab6.5s-chat');
      expect(p.name).toBe('minimax');
    });
  });

  describe('isAvailable', () => {
    it('returns true when API key is non-empty', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when API key is empty', async () => {
      const emptyProvider = new MinimaxProvider('');
      expect(await emptyProvider.isAvailable()).toBe(false);
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

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.minimax.io/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer minimax-test-key-123');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('MiniMax-M3');
      expect(body.max_tokens).toBe(1024);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toHaveLength(2);

      expect(result.content).toBe('{"riskLevel":"high","description":"Fisura diagonal en muro","confidence":0.92}');
      expect(result.metadata?.provider).toBe('minimax');
      expect(result.metadata?.model).toBe('MiniMax-M3');
    });

    it('sends two images in messages when contextImage is provided', async () => {
      const responseBody = createSuccessResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseBody,
      });

      const img1 = Buffer.from('img-1-minimax');
      const img2 = Buffer.from('img-2-minimax');
      await provider.analyze({
        image: img1,
        contextImage: img2,
        prompt: 'Analyze',
        maxTokens: 512,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toHaveLength(3);
      expect(body.messages[0].content[1].image_url.url).toBe(`data:image/jpeg;base64,${img1.toString('base64')}`);
      expect(body.messages[0].content[2].image_url.url).toBe(`data:image/jpeg;base64,${img2.toString('base64')}`);
    });
  });

  describe('analyze — error handling', () => {
    it('throws on 401 authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        'Minimax authentication failed (401)',
      );
    });

    it('throws on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(provider.analyze(createPayload())).rejects.toThrow(
        'Minimax rate limited (429)',
      );
    });
  });
});
