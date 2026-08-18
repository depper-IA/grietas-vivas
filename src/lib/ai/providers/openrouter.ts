/**
 * OpenRouter AI Provider — Fallback Mode
 *
 * Implements the IAIProvider interface for the OpenRouter API.
 * Used exclusively in fallback mode via Server Actions (API key stays server-side).
 * Enforces a 15-second timeout. Errors are thrown with clear categorization
 * so the AIServiceAdapter failover chain can route to the next provider.
 */

import type { AnalysisPayload, IAIProvider, RawProviderResponse } from '../types';

/** Timeout for OpenRouter requests (15 seconds per design spec). */
const OPENROUTER_TIMEOUT_MS = 15_000;

/** Default OpenRouter base URL. */
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/** Default free vision model on OpenRouter. */
const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

export class OpenRouterProvider implements IAIProvider {
  public readonly name = 'openrouter';
  private readonly apiKey: string;
  public readonly model: string;
  public readonly baseUrl: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, baseUrl: string = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

    try {
      const base64Image = payload.image.toString('base64');
      const endpoint = `${this.baseUrl}/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://safespace-pwa.vercel.app',
          'X-Title': 'Grietas Vivas - Crack Analysis',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: payload.maxTokens,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: payload.prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          throw new Error(`OpenRouter rate limited (429)`);
        }
        if (status === 401 || status === 403) {
          throw new Error(`OpenRouter authentication failed (${status})`);
        }
        throw new Error(`OpenRouter request failed with status ${status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '';

      return {
        content,
        metadata: {
          model: data?.model ?? this.model,
          provider: 'openrouter',
          usage: data?.usage,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenRouter request timeout after 15s');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }
}
