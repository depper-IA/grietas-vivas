/**
 * OpenAI BYOK Provider
 *
 * Implements IAIProvider for direct calls to OpenAI's Chat Completions API.
 * Used in BYOK mode — the user's API key is passed at construction time
 * and never transmitted to the app backend.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */

import type { AnalysisPayload, IAIProvider, RawProviderResponse } from '../types';

/** OpenAI Chat Completions API endpoint. */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Vision-capable model identifier por defecto. */
const DEFAULT_MODEL = 'gpt-4o';

/** Maximum request timeout in milliseconds (60 seconds per Req 5.5). */
const TIMEOUT_MS = 60_000;

/**
 * BYOK provider for OpenAI's GPT-4o / vision API.
 *
 * The API key is injected at construction and used for all subsequent requests.
 * Each request enforces a 60-second timeout via AbortController.
 */
export class OpenAIProvider implements IAIProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Send an image analysis request to the OpenAI Chat Completions API.
   *
   * @throws Error with descriptive message on auth failure, timeout, rate limit, or network error
   */
  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const base64Image = payload.image.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const body = {
        model: this.model,
        max_tokens: payload.maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
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

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) {
          throw new Error(
            `OpenAI authentication failed (${status}): API key is invalid or lacks permissions. Please verify your API key.`,
          );
        }
        if (status === 429) {
          throw new Error(
            `OpenAI rate limit exceeded (429): Too many requests. Please wait before retrying.`,
          );
        }
        throw new Error(
          `OpenAI API error (${status}): ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Extract text content from OpenAI's response format
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        content,
        metadata: {
          model: data.model,
          usage: data.usage,
          finishReason: data.choices?.[0]?.finish_reason,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          'OpenAI request timed out after 60 seconds. The provider did not respond in time.',
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
 * Factory function to create an OpenAI provider with a given API key and optional model.
 */
export function createOpenAIProvider(apiKey: string, model?: string): OpenAIProvider {
  return new OpenAIProvider(apiKey, model);
}
