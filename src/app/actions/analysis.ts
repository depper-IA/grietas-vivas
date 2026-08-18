/**
 * Server Action — Fallback AI Analysis
 *
 * Routes crack image analysis through server-managed fallback providers
 * (OpenRouter, NVIDIA NIM) when the user has no BYOK key configured.
 *
 * Security invariants:
 * - Fallback API keys are read exclusively from environment variables
 * - Image data is the ONLY input — no PII, no GPS, no metadata
 * - Error responses never expose env variable names or internal paths
 * - Image data and API keys are never logged
 */

'use server';

import { z } from 'zod';
import { AIServiceAdapter } from '@/lib/ai/aiService';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';
import { NVIDIANIMProvider } from '@/lib/ai/providers/nvidia-nim';
import type { AnalysisResult } from '@/lib/ai/types';
import type { SafeErrorResponse } from '@/lib/errors/types';

/**
 * Maximum base64 image size: ~13.7 MB (accommodates a 10 MB raw image).
 * Matches the syncPayloadSchema.imageBase64 max from validation schemas.
 */
const MAX_BASE64_SIZE = Math.ceil(10 * 1024 * 1024 * 1.37);

/** Input validation schema for the fallback analysis action. */
const fallbackAnalysisInputSchema = z.object({
  imageBase64: z
    .string()
    .min(1, 'Image data is required')
    .max(MAX_BASE64_SIZE, 'Image exceeds maximum allowed size'),
});

/** Return type: either a successful analysis or a structured error. */
export type AnalyzeWithFallbackResult =
  | { success: true; data: AnalysisResult }
  | { success: false; error: SafeErrorResponse };

/**
 * Analyze a crack image using server-managed fallback AI providers.
 *
 * This Server Action runs ONLY on the server. Environment variables
 * containing API keys are never exposed to the client.
 *
 * BYOK calls bypass this action entirely — they go directly from the
 * client to the AI provider (the key never touches our backend).
 *
 * @param input - Object containing the base64-encoded image
 * @returns Analysis result or structured error
 */
export async function analyzeWithFallback(input: {
  imageBase64: string;
}): Promise<AnalyzeWithFallbackResult> {
  // Validate input
  const validation = fallbackAnalysisInputSchema.safeParse(input);
  if (!validation.success) {
    const firstIssue = validation.error.issues[0];
    return {
      success: false,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message ?? 'Invalid input',
        },
      },
    };
  }

  // Read fallback API keys from environment (server-side only)
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const nvidiaNimKey = process.env.NVIDIA_NIM_API_KEY ?? '';

  if (!openrouterKey && !nvidiaNimKey) {
    return {
      success: false,
      error: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'No AI analysis providers are currently configured',
        },
      },
    };
  }

  // Create adapter and register fallback providers
  const adapter = new AIServiceAdapter();

  if (openrouterKey) {
    adapter.registerProvider(new OpenRouterProvider(openrouterKey));
  }
  if (nvidiaNimKey) {
    adapter.registerProvider(new NVIDIANIMProvider(nvidiaNimKey));
  }

  // Convert base64 to Blob for the adapter
  const binaryString = Buffer.from(validation.data.imageBase64, 'base64');
  const imageBlob = new Blob([binaryString], { type: 'image/jpeg' });

  try {
    const result = await adapter.analyze(imageBlob, {
      mode: 'fallback',
      fallbackPriority: ['nvidia-nim', 'openrouter'],
    });

    return { success: true, data: result };
  } catch (error) {
    // Return safe error — never expose internals like API keys or stack traces,
    // but allow specific error codes to surface helpful messages.
    let message = 'Analysis could not be completed at this time';
    let code = 'ANALYSIS_FAILED';

    if (error instanceof Error) {
      const errMsg = error.message;
      // The AIServiceAdapter wraps fallback failures as "Analysis failed: ...".
      // Treat that as the canonical ANALYSIS_FAILED code — only do specific
      // categorization for raw errors that bypass the wrapper.
      if (errMsg.startsWith('Analysis failed:')) {
        message = errMsg;
        code = 'ANALYSIS_FAILED';
      } else if (errMsg.includes('RESPONSE_PARSE_ERROR')) {
        message = 'AI provider returned an unexpected format. Please retry.';
        code = 'RESPONSE_PARSE_ERROR';
      } else if (errMsg.includes('rate limit') || errMsg.includes('429')) {
        message = 'AI provider rate limit reached. Please wait a moment and retry.';
        code = 'RATE_LIMIT';
      } else if (errMsg.includes('authentication') || errMsg.includes('401') || errMsg.includes('403')) {
        message = 'AI provider authentication failed. Please check your API key.';
        code = 'AUTH_FAILED';
      } else if (errMsg.includes('All') && errMsg.includes('models failed')) {
        message = 'All AI models are currently unavailable. Please retry in a moment.';
        code = 'ALL_MODELS_FAILED';
      } else if (errMsg.includes('timeout') || errMsg.includes('aborted')) {
        message = 'AI provider request timed out. Please retry.';
        code = 'TIMEOUT';
      }
    }

    return {
      success: false,
      error: {
        error: {
          code,
          message,
        },
      },
    };
  }
}
