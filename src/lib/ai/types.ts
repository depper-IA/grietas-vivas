/**
 * AI Service Adapter — Core Type Definitions
 *
 * Types for the modular AI provider system supporting BYOK (Bring Your Own Key)
 * and fallback modes for crack risk analysis.
 */

/** Crack severity classification assigned by AI analysis. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Structured result from an AI crack analysis. */
export interface AnalysisResult {
  /** Severity classification */
  riskLevel: RiskLevel;
  /** Textual description of the analysis (max 2000 characters) */
  description: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Name of the AI provider that produced the result */
  provider: string;
  /** ISO 8601 timestamp of when analysis was performed */
  analyzedAt: string;
}

/** Configuration for the AI service routing. */
export interface AIConfig {
  /** Operating mode: user-provided key or system fallback */
  mode: 'byok' | 'fallback';
  /** BYOK configuration, present only when mode is 'byok' */
  byok?: {
    /** Selected AI provider */
    provider: 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'minimax';
    /** User's API key (encrypted in browser memory) */
    apiKey: string;
    /** Selected model for this provider */
    model?: string;
  };
  /** Ordered list of fallback provider names by priority */
  fallbackPriority: string[];
}

/** Payload sent to an AI provider for analysis. */
export interface AnalysisPayload {
  /** Image data without EXIF metadata */
  image: Buffer;
  /** Structured prompt for crack analysis */
  prompt: string;
  /** Maximum tokens for the AI response */
  maxTokens: number;
}

/** Raw response from an AI provider before validation. */
export interface RawProviderResponse {
  /** Raw text content from the provider */
  content: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Interface that all AI providers must implement. */
export interface IAIProvider {
  /** Provider identifier */
  name: string;
  /** Send an analysis payload and receive a raw response. */
  analyze(payload: AnalysisPayload): Promise<RawProviderResponse>;
  /** Check if this provider is currently accessible. */
  isAvailable(): Promise<boolean>;
}

/** High-level AI service adapter for routing and managing providers. */
export interface IAIServiceAdapter {
  /** Analyze an image using the provided configuration. */
  analyze(image: Blob, config: AIConfig): Promise<AnalysisResult>;
  /** Register a new provider adapter. */
  registerProvider(provider: IAIProvider): void;
  /** Get names of all currently available providers. */
  getAvailableProviders(): string[];
}
