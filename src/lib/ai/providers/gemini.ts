/**
 * Google Gemini AI Provider
 *
 * Implements IAIProvider for Google's Gemini multimodal models.
 * Uses the Gemini API (generativelanguage.googleapis.com) for crack analysis.
 *
 * API keys are free from aistudio.google.com.
 */

import type { IAIProvider, AnalysisPayload, RawProviderResponse } from '../types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 60_000;

export class GeminiProvider implements IAIProvider {
  name = 'gemini';

  private apiKey: string;
  readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const imageBase64 = Buffer.from(payload.image).toString('base64');

      const parts: Array<
        | { text: string }
        | { inline_data: { mime_type: string; data: string } }
      > = [
        { text: payload.prompt },
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: imageBase64,
          },
        },
      ];

      if (payload.contextImage) {
        const contextBase64 = Buffer.from(payload.contextImage).toString('base64');
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: contextBase64,
          },
        });
      }

      const requestBody = {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: payload.maxTokens || 1024,
          responseMimeType: 'application/json',
        },
      };

      const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid Gemini API key. Get a free key at aistudio.google.com');
        }
        if (response.status === 429) {
          throw new Error('Gemini rate limit exceeded. Please try again later.');
        }
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();

      // Extract text from Gemini response structure
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return { content: text, metadata: { provider: this.name } };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
