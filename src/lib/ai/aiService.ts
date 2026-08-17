/**
 * AI Service Adapter — Strategy Pattern Implementation
 *
 * Routes crack analysis requests to the appropriate AI provider based on
 * user configuration (BYOK vs Fallback). Validates all responses against
 * Zod schema before returning results downstream.
 */

import { analysisResultSchema } from '@/lib/validation/schemas';
import type {
  AIConfig,
  AnalysisPayload,
  AnalysisResult,
  IAIProvider,
  IAIServiceAdapter,
  RawProviderResponse,
} from './types';
import type { SafeErrorResponse } from '@/lib/errors/types';

/** Maximum allowed image size in bytes (10 MB). */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Standard prompt for structural crack analysis. */
const CRACK_ANALYSIS_PROMPT = [
  'Analyze this image of a building crack or structural damage.',
  'Classify the risk level as one of: low, medium, high, or critical.',
  'Provide a concise description of the damage observed (max 2000 characters).',
  'Include a confidence score between 0.0 and 1.0.',
  'Respond in JSON format with keys: riskLevel, description, confidence.',
].join(' ');

/** Default max tokens for AI provider requests. */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Structured error thrown when AI service operations fail.
 * Conforms to SafeErrorResponse pattern — never exposes internals.
 */
export class AIServiceError extends Error {
  public readonly safeResponse: SafeErrorResponse;

  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AIServiceError';
    this.safeResponse = { error: { code, message, fields } };
  }
}

/**
 * AI Service Adapter implementing the Strategy pattern.
 *
 * - Selects provider based on AIConfig (BYOK key present → BYOK, else → fallback priority)
 * - Validates all responses with Zod before returning
 * - Supports dynamic provider registration without modifying routing logic
 */
export class AIServiceAdapter implements IAIServiceAdapter {
  private providers: Map<string, IAIProvider> = new Map();

  /**
   * Register a new AI provider adapter.
   * The provider becomes available for routing without modifying existing logic.
   */
  registerProvider(provider: IAIProvider): void {
    this.providers.set(provider.name, provider);
    this.log('info', `Provider registered: ${provider.name}`);
  }

  /**
   * Get names of all currently registered providers.
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Analyze a crack image using the configured AI provider strategy.
   *
   * Routing logic:
   * - BYOK mode (config.mode === 'byok' && config.byok.apiKey present): use BYOK provider
   * - Fallback mode: iterate fallbackPriority list, use first available provider
   *
   * @throws AIServiceError on validation failure, provider errors, or size limits
   */
  async analyze(image: Blob, config: AIConfig): Promise<AnalysisResult> {
    // Validate image size
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AIServiceError(
        'IMAGE_TOO_LARGE',
        `Image exceeds maximum size of 10 MB (received ${(image.size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }

    // Select provider based on config
    const provider = await this.selectProvider(config);
    this.log('info', `Provider selected: ${provider.name}`);

    // Convert Blob to Buffer for the payload
    const arrayBuffer = await image.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const payload: AnalysisPayload = {
      image: imageBuffer,
      prompt: CRACK_ANALYSIS_PROMPT,
      maxTokens: DEFAULT_MAX_TOKENS,
    };

    // Execute analysis
    let rawResponse: RawProviderResponse;
    try {
      rawResponse = await provider.analyze(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown provider error';
      this.log('error', `Provider ${provider.name} failed: ${this.categorizeError(message)}`);
      throw new AIServiceError(
        'PROVIDER_ERROR',
        `Analysis failed: ${this.categorizeError(message)}`,
      );
    }

    this.log('info', `Provider ${provider.name} responded successfully`);

    // Parse and validate response
    return this.validateResponse(rawResponse, provider.name);
  }

  /**
   * Select the appropriate provider based on configuration.
   *
   * BYOK mode: route to the provider specified in config.byok.provider
   * Fallback mode: iterate fallbackPriority, return first available provider
   */
  private async selectProvider(config: AIConfig): Promise<IAIProvider> {
    if (config.mode === 'byok' && config.byok?.apiKey) {
      const providerName = config.byok.provider;
      const provider = this.providers.get(providerName);

      if (!provider) {
        throw new AIServiceError(
          'PROVIDER_NOT_FOUND',
          `BYOK provider "${providerName}" is not registered`,
        );
      }

      return provider;
    }

    // Fallback mode: iterate priority list
    for (const providerName of config.fallbackPriority) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        continue;
      }

      try {
        const available = await provider.isAvailable();
        if (available) {
          return provider;
        }
      } catch {
        // Provider availability check failed, try next
        this.log('warn', `Availability check failed for ${providerName}, skipping`);
        continue;
      }
    }

    throw new AIServiceError(
      'NO_PROVIDER_AVAILABLE',
      'No AI provider is currently available for analysis',
    );
  }

  /**
   * Validate raw provider response against Zod schema.
   * Rejects with structured error if validation fails — never passes invalid data downstream.
   */
  private validateResponse(
    rawResponse: RawProviderResponse,
    providerName: string,
  ): AnalysisResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse.content);
    } catch {
      this.log('error', `Provider ${providerName} returned unparseable JSON`);
      throw new AIServiceError(
        'RESPONSE_PARSE_ERROR',
        'AI provider response could not be parsed as JSON',
      );
    }

    // Enrich with provider name and timestamp before validation
    const enriched = {
      ...(typeof parsed === 'object' && parsed !== null ? parsed : {}),
      provider: providerName,
      analyzedAt: new Date().toISOString(),
    };

    const result = analysisResultSchema.safeParse(enriched);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = issue.message;
      }

      this.log('error', `Response validation failed for provider ${providerName}`);
      throw new AIServiceError(
        'RESPONSE_VALIDATION_ERROR',
        'AI provider response failed schema validation',
        fieldErrors,
      );
    }

    return result.data;
  }

  /**
   * Categorize an error message for logging without exposing sensitive details.
   */
  private categorizeError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'timeout';
    }
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth')) {
      return 'authentication_error';
    }
    if (lower.includes('429') || lower.includes('rate limit')) {
      return 'rate_limited';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'network_error';
    }
    return 'internal_error';
  }

  /**
   * Structured logging — logs provider selection and outcomes.
   * NEVER logs API keys or image data.
   */
  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    const entry = `[AIService][${timestamp}][${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'error':
        console.error(entry);
        break;
      case 'warn':
        console.warn(entry);
        break;
      default:
        console.info(entry);
    }
  }
}

/** Singleton instance for convenience. Applications may also instantiate directly. */
export const aiService = new AIServiceAdapter();
