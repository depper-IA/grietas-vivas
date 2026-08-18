/**
 * Anthropic BYOK Provider
 *
 * Implements IAIProvider for direct calls to Anthropic's Messages API.
 * Used in BYOK mode — the user's API key is passed at construction time
 * and never transmitted to the app backend.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */

import type { AnalysisPayload, IAIProvider, RawProviderResponse } from '../types';

/** Anthropic Messages API endpoint. */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/** API version header value. */
const ANTHROPIC_VERSION = '2023-06-01';

/** Vision-capable model identifier por defecto (Claude 3.7 Sonnet). */
const DEFAULT_MODEL = 'claude-3-7-sonnet-20250219';

/** Maximum request timeout in milliseconds (60 seconds per Req 5.5). */
const TIMEOUT_MS = 60_000;

/**
 * BYOK provider for Anthropic's Claude API.
 *
 * The API key is injected at construction and used for all subsequent requests.
 * Each request enforces a 60-second timeout via AbortController.
 */
export class AnthropicProvider implements IAIProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Send an image analysis request to the Anthropic Messages API.
   *
   * @throws Error with descriptive message on auth failure, timeout, rate limit, or network error
   */
  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const base64Image = payload.image.toString('base64');

      const body = {
        model: this.model,
        max_tokens: payload.maxTokens,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: payload.prompt,
              },
            ],
          },
        ],
      };

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) {
          throw new Error(
            `Anthropic authentication failed (${status}): API key is invalid or lacks permissions. Please verify your API key.`,
          );
        }
        if (status === 429) {
          throw new Error(
            `Anthropic rate limit exceeded (429): Too many requests. Please wait before retrying.`,
          );
        }
        throw new Error(
          `Anthropic API error (${status}): ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Extract text content from Anthropic's response format
      const textBlock = data.content?.find(
        (block: { type: string }) => block.type === 'text',
      );
      const content = textBlock?.text ?? '';

      return {
        content,
        metadata: {
          model: data.model,
          usage: data.usage,
          stopReason: data.stop_reason,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          'Anthropic request timed out after 60 seconds. The provider did not respond in time.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * BYOK providers are always considered available — availability
   * depends solely on the user having provided a valid key.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Factory function to create an Anthropic provider with a given API key and optional model.
 */
export function createAnthropicProvider(apiKey: string, model?: string): AnthropicProvider {
  return new AnthropicProvider(apiKey, model);
}
