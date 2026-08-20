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
import {
  stripMarkdownJsonWrapper,
  parseMarkdownResponse,
  parseProseResponse,
} from './responseParser';
import {
  buildStructuralPrompt,
  applyStructuralRules,
  type StructuralContext,
} from './structuralPrompt';

/** Maximum allowed image size in bytes (10 MB). */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Standard prompt for structural crack analysis.
 * Basado estrictamente en la Guía Oficial de Evaluación Post-Sismo (NSR-10 / CENAPRED / FEMA 306).
 */
const CRACK_ANALYSIS_PROMPT = [
  'Eres un perito e ingeniero especialista en evaluación forense de daños y triaje estructural post-sismo.',
  'Analiza minuciosamente la imagen adjunta aplicando la siguiente MATRIZ OFICIAL DE DAÑOS Y SEVERIDAD SÍSMICA:',
  '1. CRÍTICO (riskLevel: "critical"):',
  '   - Grietas que forman "X" o grietas diagonales cruzadas en muros de carga/mampostería (falla por cortante sísmico bidireccional).',
  '   - Daño en elementos estructurales principales: vigas, columnas o nudos viga-columna (grietas diagonales por cortante o flexión).',
  '   - Concreto desprendido (spalling) con acero de refuerzo/varilla visible o corroída.',
  '   - Columnas o muros inclinados, aplastados o pandeados.',
  '2. ALTO (riskLevel: "high"):',
  '   - Grieta diagonal individual (≈45°) o grietas en escalera que atraviesan ladrillos/bloques en muros portantes.',
  '   - Grietas horizontales extensas en muros por empujes o flexión.',
  '   - Grietas profundas con separación visible entre muro y losa o columna.',
  '3. MEDIO / MODERADO (riskLevel: "medium"):',
  '   - Fisuras diagonales desde esquinas de puertas o ventanas por concentración de esfuerzos.',
  '   - Separación vertical en la junta muro-columna (muro divisorio no estructural).',
  '   - Grieta horizontal en la parte superior del muro bajo la viga o losa.',
  '4. BAJO (riskLevel: "low"):',
  '   - Fisuras superficiales capilares (<0.3 mm) en revoque, estuco o pintura (daño meramente cosmético).',
  '   - Fisuras verticales finas por retracción de fraguado.',
  '',
  'REGLAS DE EVALUACIÓN Y SALIDA:',
  '- Todo el reporte debe estar 100% en español.',
  '- Sé directo, contundente y técnicamente certero. Si observas una grieta en "X", nómbrala explícitamente como "Grietas en X por cortante sísmico" y califícala como "critical".',
  '- Redacta el campo "description" estructurado exactamente en estas 4 líneas:',
  '  Patrón: [Tipo exacto de grieta según la matriz: ej. Grietas en X / Diagonal a 45° / Escalonada / Capilar]',
  '  Ubicación: [Elemento afectado: muro de carga, columna, viga, nudo, tabique divisorio, etc.]',
  '  Severidad: [Nivel de riesgo técnico y justificación física del daño observado]',
  '  Recomendación: [Indicación clara: ej. NO HABITAR y solicitar peritaje urgente / Monitorear / Habitable]',
  '- "confidence": número entre 0.0 y 1.0 según la claridad visual de la imagen.',
  '- Responde ÚNICAMENTE con un JSON válido, sin bloques de código markdown: {"riskLevel":"low"|"medium"|"high"|"critical","description":"...","confidence":0.0-1.0}',
].join('\n');

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
  async analyze(
    image: Blob,
    config: AIConfig,
    options?: {
      contextImage?: Blob;
      structuralContext?: StructuralContext;
    },
  ): Promise<AnalysisResult> {
    // Validate image size
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AIServiceError(
        'IMAGE_TOO_LARGE',
        `Image exceeds maximum size of 10 MB (received ${(image.size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }

    let contextImageBuffer: Buffer | undefined;
    if (options?.contextImage) {
      if (options.contextImage.size > MAX_IMAGE_SIZE_BYTES) {
        throw new AIServiceError(
          'IMAGE_TOO_LARGE',
          `Context image exceeds maximum size of 10 MB (received ${(options.contextImage.size / 1024 / 1024).toFixed(2)} MB)`,
        );
      }
      const contextArrayBuffer = await options.contextImage.arrayBuffer();
      contextImageBuffer = Buffer.from(contextArrayBuffer);
    }

    // Convert Blob to Buffer for the payload
    const arrayBuffer = await image.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const prompt = options?.structuralContext
      ? await buildStructuralPrompt(options.structuralContext, !!options.contextImage)
      : CRACK_ANALYSIS_PROMPT;

    const payload: AnalysisPayload = {
      image: imageBuffer,
      contextImage: contextImageBuffer,
      structuralContext: options?.structuralContext,
      prompt,
      maxTokens: DEFAULT_MAX_TOKENS,
    };

    // Fallback chain: si el primer provider falla en el analyze,
    // intenta con el siguiente disponible. Asi un timeout de openrouter
    // cae a nvidia-nim en lugar de fallar todo el analisis.
    const priority = this.getFallbackPriority(config);
    const isByok = config.mode === 'byok';
    let lastError: Error | null = null;
    let triedAny = false; // TRUE si llegamos a llamar `analyze` en al menos un provider
    for (const providerName of priority) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        // BYOK con provider no registrado: error claro
        if (isByok) {
          throw new AIServiceError(
            'PROVIDER_NOT_FOUND',
            `BYOK provider "${providerName}" is not registered`,
          );
        }
        // Fallback con provider no registrado: seguimos
        continue;
      }

      // BYOK: skip el chequeo de disponibilidad (siempre se intenta)
      // Fallback: chequea isAvailable antes de gastar tokens
      if (config.mode === 'fallback') {
        let available = false;
        try {
          available = await provider.isAvailable();
        } catch {
          this.log('warn', `Availability check failed for ${providerName}, skipping`);
          continue;
        }
        if (!available) continue;
      }

      this.log('info', `Provider selected: ${provider.name}`);
      triedAny = true;

      // FASE 1: ejecutar analyze (puede fallar por timeout/red/etc).
      // Si falla, pasamos al siguiente provider (fallback chain).
      let rawResponse: RawProviderResponse;
      try {
        rawResponse = await provider.analyze(payload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown provider error';
        this.log(
          'warn',
          `Provider ${provider.name} failed: ${this.categorizeError(message)}, trying next`,
        );
        lastError = error instanceof Error ? error : new Error(message);
        continue;
      }
      this.log('info', `Provider ${provider.name} responded successfully`);

      // FASE 2: validar respuesta. Si la respuesta es invalida (JSON malformado,
      // campos fuera de rango, etc.), NO seguimos intentando con otros providers
      // — el modelo respondio y no tiene sentido reintentar. Lanzamos el error
      // de validacion directamente.
      let validated = this.validateResponse(rawResponse, provider.name);

      // Si se proporcionó contexto estructural, aplicar reglas estructurales
      if (options?.structuralContext) {
        validated = applyStructuralRules(validated, options.structuralContext);
      }

      return validated;
    }

    // Si ningun provider estaba disponible (ninguno paso el isAvailable),
    // devolvemos NO_PROVIDER_AVAILABLE. Si al menos uno fue probado y todos
    // fallaron en analyze, devolvemos PROVIDER_ERROR.
    if (!triedAny) {
      throw new AIServiceError(
        'NO_PROVIDER_AVAILABLE',
        'No AI provider is currently available for analysis',
      );
    }

    // Todos los providers fallaron
    const finalMessage = lastError?.message ?? 'All providers failed';
    this.log('error', `All fallback providers failed: ${this.categorizeError(finalMessage)}`);
    throw new AIServiceError(
      'PROVIDER_ERROR',
      `Analysis failed: ${this.categorizeError(finalMessage)}`,
    );
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
   * Devuelve la lista de providers a intentar en orden de prioridad.
   * BYOK usa solo su provider; fallback usa la lista de prioridad completa.
   */
  private getFallbackPriority(config: AIConfig): readonly string[] {
    if (config.mode === 'byok' && config.byok?.apiKey) {
      return [config.byok.provider];
    }
    return config.fallbackPriority;
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
      // Some providers wrap JSON in markdown code blocks
      const jsonContent = stripMarkdownJsonWrapper(rawResponse.content);
      parsed = JSON.parse(jsonContent);
    } catch {
      // Fallback 1: try to parse markdown-formatted response (e.g. **Risk Level:** Critical)
      const markdownParsed = parseMarkdownResponse(rawResponse.content);
      if (markdownParsed) {
        this.log(
          'info',
          `Provider ${providerName} returned markdown-formatted response, parsed via fallback`,
        );
        parsed = markdownParsed;
      } else {
        // Fallback 2: try to extract risk level from plain prose
        const proseParsed = parseProseResponse(rawResponse.content);
        if (proseParsed) {
          this.log(
            'warn',
            `Provider ${providerName} returned unstructured prose, parsed via prose fallback (confidence forced to 0.5)`,
          );
          parsed = proseParsed;
        } else {
          this.log(
            'error',
            `Provider ${providerName} returned unparseable response: ${rawResponse.content.slice(0, 200)}`,
          );
          throw new AIServiceError(
            'RESPONSE_PARSE_ERROR',
            'AI provider response could not be parsed as JSON',
          );
        }
      }
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

    const structuralFields = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      ...structuralFields,
      ...result.data,
    } as AnalysisResult;
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
