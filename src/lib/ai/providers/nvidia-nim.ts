/**
 * NVIDIA NIM AI Provider — Fallback Mode
 *
 * Implements the IAIProvider interface for the NVIDIA NIM API.
 * Used as second-priority fallback provider via Server Actions.
 * Enforces a 15-second timeout. Errors are thrown with clear categorization
 * so the AIServiceAdapter failover chain can route to the next provider.
 */

import type { AnalysisPayload, IAIProvider, RawProviderResponse } from '../types';

/** Timeout for NVIDIA NIM requests (15 seconds per design spec). */
const NVIDIA_NIM_TIMEOUT_MS = 15_000;

/** NVIDIA NIM chat completions endpoint. */
const NVIDIA_NIM_API_URL =
  'https://integrate.api.nvidia.com/v1/chat/completions';

/** Default model for vision analysis on NVIDIA NIM. */
const DEFAULT_MODEL = 'meta/llama-3.2-90b-vision-instruct';

export class NvidiaNimProvider implements IAIProvider {
  public readonly name = 'nvidia-nim';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NVIDIA_NIM_TIMEOUT_MS);

    try {
      const base64Image = payload.image.toString('base64');

      const response = await fetch(NVIDIA_NIM_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
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
          throw new Error(`NVIDIA NIM rate limited (429)`);
        }
        if (status === 401 || status === 403) {
          throw new Error(`NVIDIA NIM authentication failed (${status})`);
        }
        throw new Error(`NVIDIA NIM request failed with status ${status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '';

      return {
        content,
        metadata: {
          model: data?.model ?? DEFAULT_MODEL,
          provider: 'nvidia-nim',
          usage: data?.usage,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('NVIDIA NIM request timeout after 15s');
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

/** @deprecated Use NvidiaNimProvider instead */
export { NvidiaNimProvider as NVIDIANIMProvider };
