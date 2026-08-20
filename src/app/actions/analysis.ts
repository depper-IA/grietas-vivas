/**
 * Server Action — Fallback AI Analysis
 *
 * Routes crack image analysis through server-managed fallback providers
 * (OpenRouter, NVIDIA NIM) when the user has no BYOK key configured.
 * Supports multi-image analysis and structural context prompt augmentation.
 *
 * Security invariants:
 * - Only authenticated callers may spend the server-managed API keys
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
import { createServerSupabaseClient } from '@/lib/db/supabase';
import type { AnalysisResult } from '@/lib/ai/types';
import type { SafeErrorResponse } from '@/lib/errors/types';
import {
  structuralContextSchema,
  type StructuralContext,
} from '@/lib/ai/structuralPrompt';
import { checkRateLimit, SafeError } from '@/lib/security/rateLimit';

/**
 * Maximum base64 image size: ~13.7 MB (accommodates a 10 MB raw image).
 * Matches the syncPayloadSchema.imageBase64 max from validation schemas.
 */
const MAX_BASE64_SIZE = Math.ceil(10 * 1024 * 1024 * 1.37);

/** Maximum free fallback analyses per UTC week. */
const FALLBACK_LIMIT_PER_WEEK = 5;

/** Input validation schema for the fallback analysis action. */
const fallbackAnalysisInputSchema = z.object({
  imageBase64: z
    .string()
    .min(1, 'Image data is required')
    .max(MAX_BASE64_SIZE, 'Image exceeds maximum allowed size'),
  contextImageBase64: z
    .string()
    .max(MAX_BASE64_SIZE, 'Context image exceeds maximum allowed size')
    .optional(),
  structuralContext: structuralContextSchema.optional(),
  hasByokConfigured: z.boolean().optional().default(false),
});

/**
 * Returns the start of the current UTC week (Sunday 00:00:00 UTC).
 */
function getStartOfCurrentUtcWeek(): Date {
  const now = new Date();
  const utc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const dayOfWeek = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - dayOfWeek);
  return utc;
}

/**
 * Checks and enforces the weekly fallback attempt limit for a user.
 *
 * Logic:
 * - If user has BYOK configured, skip the limit check entirely
 * - Get current fallback_attempts_used and fallback_attempts_reset_at from DB
 * - If reset_at is before the start of the current UTC week, reset counter to 0
 * - If used >= 5, throw SafeError with FALLBACK_LIMIT_REACHED
 * - Otherwise, increment used and proceed
 */
async function checkFallbackLimit(userId: string, hasByokConfigured: boolean): Promise<void> {
  if (hasByokConfigured) {
    return;
  }

  const supabase = await createServerSupabaseClient();
  const startOfWeek = getStartOfCurrentUtcWeek();

  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('fallback_attempts_used, fallback_attempts_reset_at')
    .eq('id', userId)
    .single();

  if (fetchError || !user) {
    throw new SafeError(
      'INTERNAL_ERROR',
      'No fue posible verificar el limite de analisis. Por favor intenta de nuevo.',
    );
  }

  const resetAt = new Date(user.fallback_attempts_reset_at ?? 0);
  const used = user.fallback_attempts_used ?? 0;

  if (resetAt < startOfWeek) {
    await supabase
      .from('users')
      .update({
        fallback_attempts_used: 1,
        fallback_attempts_reset_at: new Date().toISOString(),
      })
      .eq('id', userId);
    return;
  }

  if (used >= FALLBACK_LIMIT_PER_WEEK) {
    throw new SafeError(
      'FALLBACK_LIMIT_REACHED',
      'Has alcanzado el limite de 5 analisis gratuitos esta semana. Configura tu propia clave API en Settings para continuar.',
    );
  }

  await supabase
    .from('users')
    .update({
      fallback_attempts_used: used + 1,
    })
    .eq('id', userId);
}

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
 * @param input - Object containing base64 image(s) and optional structural context
 * @returns Analysis result or structured error
 */
export async function analyzeWithFallback(input: {
  imageBase64: string;
  contextImageBase64?: string;
  structuralContext?: unknown;
  hasByokConfigured?: boolean;
}): Promise<AnalyzeWithFallbackResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida. Por favor inicia sesión e intenta de nuevo.',
        },
      },
    };
  }

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

  try {
    await checkFallbackLimit(user.id, validation.data.hasByokConfigured ?? false);
  } catch (error) {
    if (error instanceof SafeError) {
      return { success: false, error: error.safeResponse };
    }
    throw error;
  }

  try {
    await checkRateLimit(user.id, 'analysis', 10);
  } catch (error) {
    if (error instanceof SafeError) {
      return { success: false, error: error.safeResponse };
    }
    throw error;
  }

  // Read fallback API keys from environment (server-side only)
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? process.env.OpenROUTER_API ?? '';
  const nvidiaNimKey = process.env.NVIDIA_NIM_API_KEY ?? process.env.nvidia_api ?? '';

  if (!openrouterKey && !nvidiaNimKey) {
    return {
      success: false,
      error: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'No hay proveedores de análisis IA configurados',
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

  let contextImageBlob: Blob | undefined;
  if (validation.data.contextImageBase64) {
    const contextBinaryString = Buffer.from(validation.data.contextImageBase64, 'base64');
    contextImageBlob = new Blob([contextBinaryString], { type: 'image/jpeg' });
  }

  try {
    const result = await adapter.analyze(
      imageBlob,
      {
        mode: 'fallback',
        fallbackPriority: ['nvidia-nim', 'openrouter'],
      },
      {
        contextImage: contextImageBlob,
        structuralContext: validation.data.structuralContext as StructuralContext | undefined,
      },
    );

    return { success: true, data: result };
  } catch (error) {
    // Return safe error — never expose internals like API keys or stack traces,
    // but allow specific error codes to surface helpful messages in Spanish.
    let message = 'No fue posible completar el análisis en este momento.';
    let code = 'ANALYSIS_FAILED';

    if (error instanceof Error) {
      const errMsg = error.message;
      // The AIServiceAdapter wraps fallback failures as "Analysis failed: ...".
      // Treat that as the canonical ANALYSIS_FAILED code — only do specific
      // categorization for raw errors that bypass the wrapper.
      if (errMsg.startsWith('Analysis failed:')) {
        message = 'El análisis no pudo completarse con los proveedores disponibles.';
        code = 'ANALYSIS_FAILED';
      } else if (errMsg.includes('RESPONSE_PARSE_ERROR')) {
        message = 'El proveedor de IA devolvió un formato inesperado. Por favor reintenta.';
        code = 'RESPONSE_PARSE_ERROR';
      } else if (errMsg.includes('rate limit') || errMsg.includes('429')) {
        message = 'Límite de solicitudes alcanzado en el proveedor de IA. Espera un momento y reintenta.';
        code = 'RATE_LIMIT';
      } else if (errMsg.includes('authentication') || errMsg.includes('401') || errMsg.includes('403')) {
        message = 'Error de autenticación con el proveedor de IA. Revisa tu clave API.';
        code = 'AUTH_FAILED';
      } else if (errMsg.includes('All') && errMsg.includes('models failed')) {
        message = 'Todos los modelos de IA no están disponibles actualmente. Por favor reintenta en breve.';
        code = 'ALL_MODELS_FAILED';
      } else if (errMsg.includes('timeout') || errMsg.includes('aborted')) {
        message = 'La solicitud al proveedor de IA excedió el tiempo de espera. Por favor reintenta.';
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
