/**
 * Google Gemini Provider — Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiProvider } from './gemini';
import type { AnalysisPayload } from '../types';

function createPayload(overrides: Partial<AnalysisPayload> = {}): AnalysisPayload {
  return {
    image: Buffer.from('fake-image-data'),
    prompt: 'Analyze this crack with NSR-10 prompt',
    maxTokens: 1024,
    ...overrides,
  };
}

function createSuccessResponse(text: string = '{"riskLevel":"medium","description":"Grieta","confidence":0.85}') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    }),
  } as unknown as Response;
}

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new GeminiProvider('fake-gemini-key');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('has name "gemini"', () => {
    expect(provider.name).toBe('gemini');
  });

  it('uses dynamic payload.prompt instead of hardcoded text', async () => {
    fetchMock.mockResolvedValue(createSuccessResponse());
    const payload = createPayload({ prompt: 'Custom dynamic prompt for structural analysis' });

    await provider.analyze(payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.contents[0].parts[0].text).toBe('Custom dynamic prompt for structural analysis');
  });

  it('includes contextImage when provided in payload', async () => {
    fetchMock.mockResolvedValue(createSuccessResponse());
    const image1 = Buffer.from('img-1');
    const image2 = Buffer.from('img-2');
    const payload = createPayload({ image: image1, contextImage: image2 });

    await provider.analyze(payload);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const parts = body.contents[0].parts;

    expect(parts).toHaveLength(3);
    expect(parts[0].text).toBe(payload.prompt);
    expect(parts[1].inline_data.data).toBe(image1.toString('base64'));
    expect(parts[2].inline_data.data).toBe(image2.toString('base64'));
  });

  it('throws helpful error on 401/403 auth failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('API key not valid'),
    } as unknown as Response);

    await expect(provider.analyze(createPayload())).rejects.toThrow(
      /Invalid Gemini API key/i,
    );
  });

  it('throws error on 429 rate limit', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue('Quota exceeded'),
    } as unknown as Response);

    await expect(provider.analyze(createPayload())).rejects.toThrow(
      /Gemini rate limit exceeded/i,
    );
  });
});
