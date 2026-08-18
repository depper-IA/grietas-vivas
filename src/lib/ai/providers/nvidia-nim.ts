/**
 * NVIDIA NIM AI Provider — Fallback Mode
 *
 * Implementa IAIProvider para NVIDIA NIM. Caracteristicas:
 * - Descubre modelos vision-capable disponibles en la API key del usuario
 *   (vision, multimodal, vlm en el nombre).
 * - Filtra a modelos que aceptan imagenes (no solo texto).
 * - Cachea la lista por sesion para no martillar la API de modelos.
 * - Si el primer modelo falla, prueba el siguiente automaticamente.
 * - Enforces 15-second timeout per request.
 */

import type { AnalysisPayload, IAIProvider, RawProviderResponse } from '../types';

/** Timeout per request (15 seconds per design spec). */
const NVIDIA_NIM_TIMEOUT_MS = 15_000;

/** NVIDIA NIM chat completions endpoint. */
const NVIDIA_NIM_API_URL =
  'https://integrate.api.nvidia.com/v1/chat/completions';

/** Endpoint para listar modelos disponibles con la API key. */
const NVIDIA_NIM_MODELS_URL = 'https://integrate.api.nvidia.com/v1/models';

/** TTL del cache de modelos (1 hora — evita refetch en cada analyze). */
const MODELS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Filtra modelos de NVIDIA NIM que acepten imagenes (chat completions).
 *
 * Criterio conservador para evitar falsos positivos:
 *  - Vision explicito en el nombre (vision, vlm, multimodal)
 *  - Pixtral (vision-only)
 *  - Neva (NVIDIA vision)
 *  - Mistral-small-3.x (multimodal aunque no diga "vision")
 *  - MiniMax / m3 en el nombre (multimodal confirmado)
 *  - El modelo configurado por env var (override)
 *
 * Excluye explicitamente:
 *  - Modelos de embedding (bge-, nemoretriever-, embed-*)
 *  - Modelos solo-texto (instruct, completions, chat sin vision)
 */
function isVisionModel(name: string): boolean {
  const lower = name.toLowerCase();

  // Excluir modelos que NO son chat multimodal
  if (lower.includes('embed') || lower.includes('retriever') || lower.startsWith('baai/')) {
    return false;
  }

  // Vision/multimodal explicito
  if (
    lower.includes('vision') ||
    lower.includes('vlm') ||
    lower.includes('multimodal') ||
    lower.includes('pixtral')
  ) {
    return true;
  }

  // NVIDIA's own vision model
  if (lower.includes('neva')) {
    return true;
  }

  // Mistral-small-3.x (multimodal probado)
  if (lower.startsWith('mistralai/mistral-small-3')) {
    return true;
  }

  // MiniMax / m3 (MiniMax-M3 confirmado multimodal y rapido en NVIDIA NIM)
  if (lower.includes('MiniMax') || lower.includes('m3')) {
    return true;
  }

  // Modelo preferido del usuario via env var
  if (process.env.NVIDIA_NIM_MODEL && name === process.env.NVIDIA_NIM_MODEL) {
    return true;
  }

  return false;
}

interface CachedModels {
  models: string[];
  fetchedAt: number;
}

export class NvidiaNimProvider implements IAIProvider {
  public readonly name = 'nvidia-nim';
  private readonly apiKey: string;
  public readonly model: string;
  public readonly baseUrl: string;
  private cache: CachedModels | null = null;
  private inflightModelsPromise: Promise<string[]> | null = null;

  constructor(
    apiKey: string,
    model: string = 'minimaxai/minimax-m3',
    baseUrl: string = 'https://integrate.api.nvidia.com/v1',
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Devuelve la lista de modelos vision-capable disponibles con esta API key.
   * Cachea el resultado por 1 hora. Si hay un fetch en curso, retorna
   * la misma promise (deduplicacion).
   *
   * El modelo configurado por env var `NVIDIA_NIM_MODEL` se coloca
   * SIEMPRE al inicio de la lista (mayor prioridad).
   */
  async getVisionModels(): Promise<string[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < MODELS_CACHE_TTL_MS) {
      return this.prependConfiguredModel(this.cache.models);
    }
    if (this.inflightModelsPromise) {
      const models = await this.inflightModelsPromise;
      return this.prependConfiguredModel(models);
    }
    this.inflightModelsPromise = this.fetchVisionModels().finally(() => {
      this.inflightModelsPromise = null;
    });
    const models = await this.inflightModelsPromise;
    return this.prependConfiguredModel(models);
  }

  /**
   * Si el usuario configuro NVIDIA_NIM_MODEL, lo coloca al inicio de la lista
   * (sin duplicar si ya estaba). Asi el modelo preferido siempre se intenta primero.
   */
  private prependConfiguredModel(models: string[]): string[] {
    const preferred = process.env.NVIDIA_NIM_MODEL?.trim();
    if (!preferred) return models;
    const filtered = models.filter((m) => m !== preferred);
    return [preferred, ...filtered];
  }

  private async fetchVisionModels(): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NVIDIA_NIM_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`NVIDIA NIM models list failed with status ${response.status}`);
      }
      const data = await response.json();
      const allModels: Array<{ id: string }> = data?.data ?? [];
      const visionModels = allModels
        .map((m) => m.id)
        .filter(isVisionModel);
      this.cache = { models: visionModels, fetchedAt: Date.now() };
      return visionModels;
    } catch (err) {
      // Si falla el listado, devolvemos lista vacia y el caller
      // decide si abortar o usar un fallback hardcodeado.
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async analyze(payload: AnalysisPayload): Promise<RawProviderResponse> {
    const models = await this.getVisionModels();

    // Fallback hardcodeado si la API de modelos fallo (red, rate limit, etc.).
    // Probado en vivo con la API key del proyecto (2026-08-18):
    //  - minimaxai/minimax-m3 responde en ~600ms
    //  - meta/llama-3.2-11b-vision-instruct responde en ~700ms
    //  - Los demas (90b, neva-22b, phi-3, pixtral, gemma-3) devuelven 404 o timeout
    const preferredFromEnv = process.env.NVIDIA_NIM_MODEL?.trim();
    const fallbackModels = [
      preferredFromEnv ?? 'minimaxai/minimax-m3',
      'meta/llama-3.2-11b-vision-instruct',
    ];
    const modelsToTry = models.length > 0 ? models : fallbackModels;

    let lastError: Error | null = null;
    for (const model of modelsToTry) {
      try {
        const response = await this.callModel(model, payload);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        lastError = err instanceof Error ? err : new Error(message);
        // Continua con el siguiente modelo
      }
    }

    // Ningun modelo respondio — devolvemos el ultimo error
    const finalMessage = lastError?.message ?? 'All models failed';
    throw new Error(`NVIDIA NIM: all ${modelsToTry.length} models failed. Last error: ${finalMessage}`);
  }

  private async callModel(
    model: string,
    payload: AnalysisPayload,
  ): Promise<RawProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NVIDIA_NIM_TIMEOUT_MS);

    try {
      const base64Image = payload.image.toString('base64');

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: payload.maxTokens,
          temperature: 0.2,
          response_format: { type: 'json_object' },
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
          throw new Error(`NVIDIA NIM (${model}) rate limited (429)`);
        }
        if (status === 401 || status === 403) {
          throw new Error(`NVIDIA NIM (${model}) authentication failed (${status})`);
        }
        if (status === 404) {
          throw new Error(`NVIDIA NIM (${model}) not found (404)`);
        }
        throw new Error(`NVIDIA NIM (${model}) request failed with status ${status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '';

      return {
        content,
        metadata: {
          model,
          provider: 'nvidia-nim',
          usage: data?.usage,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`NVIDIA NIM (${model}) timeout after 15s`);
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