/**
 * Fallback Analysis Runner — server-managed AI providers.
 *
 * Builds the provider chain from environment keys and runs a multimodal crack
 * analysis. Extracted so that every server-side caller shares ONE definition of
 * "run the fallback analysis", instead of each Server Action assembling its own
 * adapter.
 *
 * Security note: this module reads API keys from the environment and therefore
 * must never be imported from a client component.
 *
 * Callers are responsible for authenticating and rate limiting BEFORE invoking
 * this helper — it performs no authorization of its own.
 */

import { AIServiceAdapter } from './aiService';
import { OpenRouterProvider } from './providers/openrouter';
import { NVIDIANIMProvider } from './providers/nvidia-nim';
import type { AnalysisResult } from './types';
import type { StructuralContext } from './structuralPrompt';

/** Raised when no server-managed provider key is configured. */
export class NoProvidersConfiguredError extends Error {
  constructor() {
    super('No fallback AI providers are configured');
    this.name = 'NoProvidersConfiguredError';
  }
}

/**
 * Run a crack analysis through the server-managed fallback providers.
 *
 * @throws NoProvidersConfiguredError when no provider key is present.
 */
export async function runFallbackAnalysis(input: {
  image: Blob;
  contextImage?: Blob;
  structuralContext?: StructuralContext;
}): Promise<AnalysisResult> {
  const openrouterKey =
    process.env.OPENROUTER_API_KEY ?? process.env.OpenROUTER_API ?? '';
  const nvidiaNimKey =
    process.env.NVIDIA_NIM_API_KEY ?? process.env.nvidia_api ?? '';

  if (!openrouterKey && !nvidiaNimKey) {
    throw new NoProvidersConfiguredError();
  }

  const adapter = new AIServiceAdapter();

  if (openrouterKey) {
    adapter.registerProvider(new OpenRouterProvider(openrouterKey));
  }
  if (nvidiaNimKey) {
    adapter.registerProvider(new NVIDIANIMProvider(nvidiaNimKey));
  }

  return adapter.analyze(
    input.image,
    {
      mode: 'fallback',
      fallbackPriority: ['nvidia-nim', 'openrouter'],
    },
    {
      contextImage: input.contextImage,
      structuralContext: input.structuralContext,
    },
  );
}
