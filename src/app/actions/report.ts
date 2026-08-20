'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/db/supabase';
import type { SafeErrorResponse } from '@/lib/errors/types';
import { indexCalibration } from '@/lib/ai/rag';
import {
  runFallbackAnalysis,
  NoProvidersConfiguredError,
} from '@/lib/ai/fallbackAnalysis';
import type { AnalysisResult, RiskLevel } from '@/lib/ai/types';
import type { StructuralContext } from '@/lib/ai/structuralPrompt';
import { riskLevelSchema } from '@/lib/validation/schemas';
import { crackPatternSchema } from '@/lib/validation/crackTaxonomy';
import { checkRateLimit, SafeError } from '@/lib/security/rateLimit';

/**
 * Report output returned by the Edge Function.
 */
export interface ReportOutput {
  reportId: string;
  pdfStoragePath: string;
  integrityHash: string;
  downloadUrl: string;
  generatedAt: string;
}

/**
 * Result of a successful report generation.
 */
export interface GenerateReportSuccess {
  success: true;
  report: ReportOutput;
}

/**
 * Result of a failed report generation.
 */
export interface GenerateReportError {
  success: false;
  error: SafeErrorResponse['error'];
}

export type GenerateReportResult = GenerateReportSuccess | GenerateReportError;

/**
 * Server Action: Request PDF report generation via the Edge Function.
 *
 * 1. Validates the authenticated user session
 * 2. Fetches the report row from the database (by captureId and user_id)
 * 3. Invokes the generate-report Edge Function with service_role_key
 * 4. Returns ReportOutput on success
 *
 * Validates: Requirements 8.4
 */
export async function generateReport(data: {
  captureId: string;
}): Promise<GenerateReportResult> {
  try {
    // 1. Get authenticated user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida. Por favor inicia sesión e intenta de nuevo.',
        },
      };
    }

    // Rate limit BEFORE invoking the Edge Function. 5 req/min — PDF generation
    // is heavy (SHA-256 + Supabase storage upload + signed URL).
    try {
      await checkRateLimit(user.id, 'report', 5);
    } catch (error) {
      if (error instanceof SafeError) {
        return { success: false, error: error.safeError };
      }
      throw error;
    }

    // 2. Validate captureId
    const { captureId } = data;

    if (!captureId || typeof captureId !== 'string') {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Se requiere un ID de captura válido.',
          fields: { captureId: 'El ID de captura debe ser una cadena no vacía' },
        },
      };
    }

    // 3. Fetch report data from the reports table (RLS ensures user can only access own reports)
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', captureId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !report) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reporte no encontrado. Verifica el identificador de captura.',
        },
      };
    }

    // 4. Build ReportInput payload for the Edge Function
    const reportInput = {
      captureId: report.id,
      userId: user.id,
      imageStoragePath: report.image_storage_path,
      metadata: {
        id: report.id,
        timestamp: {
          local: report.local_timestamp,
          server: report.server_timestamp ?? null,
          verified: report.timestamp_verified ?? false,
        },
        gps: {
          latitude: report.gps_latitude ?? null,
          longitude: report.gps_longitude ?? null,
          accuracy: report.gps_accuracy ?? null,
          available: report.gps_latitude !== null && report.gps_longitude !== null,
          reliable: report.gps_reliable ?? false,
        },
        orientation: report.sensor_metadata?.orientation ?? {
          alpha: null,
          beta: null,
          gamma: null,
          available: false,
        },
        deviceInfo: report.sensor_metadata?.deviceInfo ?? {
          userAgent: 'unknown',
          platform: 'unknown',
        },
      },
      analysis: {
        riskLevel: report.risk_level,
        description: report.analysis_text,
        confidence: report.analysis_confidence,
        provider: report.analysis_provider,
        analyzedAt: report.created_at,
      },
    };

    // 5. Invoke the Edge Function with service_role_key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'El servicio no está disponible temporalmente. Por favor intenta más tarde.',
        },
      };
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/generate-report`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(reportInput),
      signal: AbortSignal.timeout(30000), // 30 second timeout matching Requirement 8.7
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);

      // Surface missing fields from Edge Function validation (Requirement 8.5)
      if (errorBody?.error?.fields) {
        return {
          success: false,
          error: {
            code: 'REPORT_GENERATION_FAILED',
            message: errorBody.error.message || 'La generación del reporte falló por campos faltantes.',
            fields: errorBody.error.fields,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: errorBody?.error?.message
            || `No se pudo generar el reporte (HTTP ${response.status}). Por favor intenta más tarde.`,
        },
      };
    }

    // 6. Parse and return ReportOutput
    const reportOutput: ReportOutput = await response.json();

    return {
      success: true,
      report: reportOutput,
    };
  } catch (error) {
    // Handle timeout specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'La generación del reporte excedió el tiempo límite. Por favor intenta más tarde.',
        },
      };
    }

    // Never expose internal error details
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado. Por favor intenta más tarde.',
      },
    };
  }
}

/**
 * Result of deleting a report.
 */
export interface DeleteReportSuccess {
  success: true;
}

export interface DeleteReportError {
  success: false;
  error: SafeErrorResponse['error'];
}

export type DeleteReportResult = DeleteReportSuccess | DeleteReportError;

/**
 * Server Action: Delete a report and its associated files from Supabase Storage.
 */
export async function deleteReport(data: {
  reportId: string;
}): Promise<DeleteReportResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida. Por favor inicia sesión e intenta de nuevo.',
        },
      };
    }

    const { reportId } = data;
    if (!reportId || typeof reportId !== 'string') {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Se requiere un ID de reporte válido.',
        },
      };
    }

    // 1. Obtener los paths de almacenamiento antes de borrar la fila
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, image_storage_path, pdf_storage_path, sensor_metadata')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !report) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reporte no encontrado o no tienes permiso para eliminarlo.',
        },
      };
    }

    // 2. Eliminar archivos de Supabase Storage
    const pathsToDelete: string[] = [];
    if (report.image_storage_path) pathsToDelete.push(report.image_storage_path);
    if (report.pdf_storage_path) pathsToDelete.push(report.pdf_storage_path);
    const contextPath = report.sensor_metadata?.contextImageStoragePath;
    if (typeof contextPath === 'string' && contextPath) {
      pathsToDelete.push(contextPath);
    }

    if (pathsToDelete.length > 0) {
      await supabase.storage.from('captures').remove(pathsToDelete);
    }

    // 3. Eliminar la fila de la base de datos
    const { error: deleteError } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportId)
      .eq('user_id', user.id);

    if (deleteError) {
      return {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: 'No se pudo eliminar el reporte de la base de datos.',
        },
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error al eliminar el reporte. Por favor intenta más tarde.',
      },
    };
  }
}

/**
 * Maximum length of the free-text calibration note.
 *
 * This is a security bound, not a UX one: the note is embedded verbatim into
 * the shared RAG bank and later injected into OTHER users' analysis prompts as
 * expert-verified ground truth. An unbounded field there is an injection
 * surface against a safety-critical triage decision.
 */
const MAX_CALIBRATION_NOTES = 500;

/** Input schema for calibrateReport. Reuses the project's canonical enums. */
const calibrateReportSchema = z.object({
  reportId: z.string().uuid('El identificador del reporte no es válido.'),
  isAccurate: z.boolean(),
  verifiedRiskLevel: riskLevelSchema,
  verifiedPattern: crackPatternSchema.optional(),
  notes: z
    .string()
    .max(
      MAX_CALIBRATION_NOTES,
      `Las observaciones no pueden superar ${MAX_CALIBRATION_NOTES} caracteres.`,
    )
    .optional(),
});

/**
 * Server Action: Submit expert calibration / feedback for active dataset curation.
 */
export async function calibrateReport(data: {
  reportId: string;
  isAccurate: boolean;
  verifiedRiskLevel: string;
  verifiedPattern?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: SafeErrorResponse['error'] }> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida para calibrar el reporte.',
        },
      };
    }

    // Validate BEFORE any database write and before the RAG indexing step:
    // this payload becomes shared ground truth for every other user.
    const validation = calibrateReportSchema.safeParse(data);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message ?? 'Datos de calibración inválidos.',
        },
      };
    }

    const { reportId, isAccurate, verifiedRiskLevel, verifiedPattern, notes } =
      validation.data;

    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, sensor_metadata')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !report) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reporte no encontrado.',
        },
      };
    }

    const currentMetadata = report.sensor_metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      calibration: {
        isAccurate,
        verifiedRiskLevel,
        verifiedPattern: verifiedPattern || null,
        notes: notes?.trim() || null,
        calibratedAt: new Date().toISOString(),
        calibratedBy: user.id,
      },
    };

    const { error: updateError } = await supabase
      .from('reports')
      .update({ sensor_metadata: updatedMetadata })
      .eq('id', reportId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'No se pudo guardar la calibración pericial.',
        },
      };
    }

    // RAG: indexar la calibración para alimentar el banco de ejemplos.
    // Best-effort: si falla, el reporte sigue considerándose calibrado.
    try {
      if (verifiedPattern) {
        await indexCalibration({
          reportId,
          userId: user.id,
          riskLevel: verifiedRiskLevel as RiskLevel,
          pattern: verifiedPattern,
          isAccurate,
          notes: notes?.trim() || null,
        });
      }
    } catch {
      // El RAG es best-effort; el reporte guarda la calibración de todos modos.
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado al calibrar el reporte.',
      },
    };
  }
}

/**
 * Server Action: Re-run the AI analysis for an existing report.
 *
 * Replaces the previous `updateReportAnalysis`, which accepted the analysis
 * text, risk level and confidence straight from the client. That let the owner
 * of a report rewrite its verdict and then mint a PDF whose SHA-256 attested
 * only that the file had not changed AFTER generation — never that the content
 * came from the AI. Since the PRD positions these reports as supporting
 * evidence for insurers and civil-protection authorities, that was a forgery
 * path.
 *
 * Here the caller supplies ONLY a report id. The server reads the images from
 * storage, runs the analysis itself and writes the outcome, so the stored
 * verdict provably originates from the model.
 */
export async function reanalyzeReport(data: {
  reportId: string;
}): Promise<{
  success: boolean;
  data?: AnalysisResult;
  error?: SafeErrorResponse['error'];
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida para reanalizar el reporte.',
        },
      };
    }

    // Re-analysis spends the shared provider quota, so it shares the
    // 'analysis' bucket with the capture flow.
    try {
      await checkRateLimit(user.id, 'analysis', 10);
    } catch (error) {
      if (error instanceof SafeError) {
        return { success: false, error: error.safeError };
      }
      throw error;
    }

    const validation = z
      .object({ reportId: z.string().uuid('El identificador del reporte no es válido.') })
      .safeParse(data);

    if (!validation.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            validation.error.issues[0]?.message ?? 'Datos de reanálisis inválidos.',
        },
      };
    }

    const { reportId } = validation.data;

    // Ownership is enforced by the user_id filter (and by RLS underneath).
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, image_storage_path, sensor_metadata')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !report) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reporte no encontrado.',
        },
      };
    }

    if (!report.image_storage_path) {
      return {
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: 'El reporte no tiene una imagen almacenada para reanalizar.',
        },
      };
    }

    // Read the evidence from storage — never from the request payload.
    const { data: imageBlob, error: imageError } = await supabase.storage
      .from('captures')
      .download(report.image_storage_path);

    if (imageError || !imageBlob) {
      return {
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: 'No se pudo recuperar la imagen del reporte.',
        },
      };
    }

    const sensorMetadata = (report.sensor_metadata ?? {}) as Record<string, unknown>;

    let contextBlob: Blob | undefined;
    const contextPath = sensorMetadata.contextImageStoragePath;
    if (typeof contextPath === 'string' && contextPath) {
      const { data: ctxBlob } = await supabase.storage
        .from('captures')
        .download(contextPath);
      contextBlob = ctxBlob ?? undefined;
    }

    let analysis: AnalysisResult;
    try {
      analysis = await runFallbackAnalysis({
        image: imageBlob,
        contextImage: contextBlob,
        structuralContext: sensorMetadata.structuralContext as
          | StructuralContext
          | undefined,
      });
    } catch (error) {
      if (error instanceof NoProvidersConfiguredError) {
        return {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'No hay proveedores de análisis IA configurados.',
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'ANALYSIS_FAILED',
          message: 'El reanálisis no pudo completarse con los proveedores disponibles.',
        },
      };
    }

    const { error: updateError } = await supabase
      .from('reports')
      .update({
        risk_level: analysis.riskLevel,
        analysis_text: analysis.description,
        analysis_confidence: analysis.confidence,
        analysis_provider: analysis.provider || 'ai',
        status: 'analyzed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'No se pudo actualizar el análisis en la base de datos.',
        },
      };
    }

    return { success: true, data: analysis };
  } catch {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error al reanalizar el reporte.',
      },
    };
  }
}

/**
 * Calculate geohash of 3 decimal places (~111m precision) for grouping.
 */
function toGeohash(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * Get worst risk level from a list of reports.
 */
function getWorstRisk(
  reports: Array<{ risk_level: string | null }>,
): 'critical' | 'high' | 'medium' | 'low' {
  const riskOrder = ['critical', 'high', 'medium', 'low'] as const;
  let worst: (typeof riskOrder)[number] = 'low';
  for (const report of reports) {
    const risk = (report.risk_level ?? 'low') as (typeof riskOrder)[number];
    const idx = riskOrder.indexOf(risk);
    const worstIdx = riskOrder.indexOf(worst);
    if (idx < worstIdx) {
      worst = risk;
    }
  }
  return worst;
}

/**
 * Result of cluster report generation.
 */
export interface ClusterReportOutput {
  clusterId: string;
  pdfStoragePath: string;
  integrityHash: string;
  downloadUrl: string;
  generatedAt: string;
  reportCount: number;
  worstRisk: string;
  trend: 'worsening' | 'improving' | 'stable';
}

/**
 * Result of successful cluster report generation.
 */
export interface GenerateClusterReportSuccess {
  success: true;
  report: ClusterReportOutput;
}

/**
 * Result of failed cluster report generation.
 */
export interface GenerateClusterReportError {
  success: false;
  error: SafeErrorResponse['error'];
}

export type GenerateClusterReportResult =
  | GenerateClusterReportSuccess
  | GenerateClusterReportError;

/**
 * Server Action: Generate a consolidated PDF report for all reports
 * in a cluster (grouped by location ~111m precision).
 *
 * 1. Validates the authenticated user session
 * 2. Fetches all reports for the user and groups them by geohash
 * 3. For the specified cluster, calculates worst risk and trend
 * 4. Generates a consolidated PDF with all photos
 * 5. Computes SHA-256 integrity hash of the PDF
 * 6. Returns the download URL
 */
export async function generateClusterReport(data: {
  clusterId: string;
}): Promise<GenerateClusterReportResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida. Por favor inicia sesión e intenta de nuevo.',
        },
      };
    }

    const { clusterId } = data;
    if (!clusterId || typeof clusterId !== 'string') {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Se requiere un identificador de cluster valido.',
        },
      };
    }

    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('id, gps_latitude, gps_longitude, risk_level, created_at, image_storage_path')
      .eq('user_id', user.id)
      .not('gps_latitude', 'is', null)
      .not('gps_longitude', 'is', null)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'No fue posible obtener los reportes del hogar.',
        },
      };
    }

    const groups = new Map<string, typeof reports>();
    for (const report of reports ?? []) {
      const geohash = toGeohash(report.gps_latitude, report.gps_longitude);
      if (!geohash) continue;

      const existing = groups.get(geohash);
      if (existing) {
        existing.push(report);
      } else {
        groups.set(geohash, [report]);
      }
    }

    const clusterReports = groups.get(clusterId);
    if (!clusterReports || clusterReports.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Hogar no encontrado o sin reportes con ubicacion.',
        },
      };
    }

    const worstRisk = getWorstRisk(clusterReports);

    const sorted = [...clusterReports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const recent = sorted.slice(0, 2);
    const previous = sorted.slice(2, 4);

    const riskOrder = ['critical', 'high', 'medium', 'low'] as const;
    let trend: 'worsening' | 'improving' | 'stable' = 'stable';

    if (recent.length > 0 && previous.length > 0) {
      const avgRecent =
        recent.reduce((sum, r) => {
          const risk = (r.risk_level ?? 'low') as (typeof riskOrder)[number];
          return sum + riskOrder.indexOf(risk);
        }, 0) / recent.length;
      const avgPrevious =
        previous.reduce((sum, r) => {
          const risk = (r.risk_level ?? 'low') as (typeof riskOrder)[number];
          return sum + riskOrder.indexOf(risk);
        }, 0) / previous.length;

      if (avgRecent < avgPrevious) trend = 'worsening';
      else if (avgRecent > avgPrevious) trend = 'improving';
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'El servicio no esta disponible temporalmente.',
        },
      };
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/generate-cluster-report`;

    const imagePaths = clusterReports
      .map((r) => r.image_storage_path)
      .filter((p): p is string => Boolean(p));

    const reportInput = {
      clusterId,
      userId: user.id,
      reportCount: clusterReports.length,
      worstRisk,
      trend,
      imagePaths,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(reportInput),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: 'No se pudo generar el reporte consolidado.',
        },
      };
    }

    const result: {
      pdfStoragePath: string;
      integrityHash: string;
      downloadUrl: string;
      generatedAt: string;
    } = await response.json();

    return {
      success: true,
      report: {
        clusterId,
        pdfStoragePath: result.pdfStoragePath,
        integrityHash: result.integrityHash,
        downloadUrl: result.downloadUrl,
        generatedAt: result.generatedAt,
        reportCount: clusterReports.length,
        worstRisk,
        trend,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'La generacion del reporte excedio el tiempo limite.',
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrio un error inesperado.',
      },
    };
  }
}

/**
 * Result of getting user clusters.
 */
export interface GetUserClustersSuccess {
  success: true;
  clusters: Array<{
    clusterId: string;
    reportCount: number;
    worstRisk: 'critical' | 'high' | 'medium' | 'low';
    trend: 'worsening' | 'improving' | 'stable';
    latestDate: string;
    latestReportId: string;
  }>;
}

/**
 * Result of failed cluster fetch.
 */
export interface GetUserClustersError {
  success: false;
  error: SafeErrorResponse['error'];
}

export type GetUserClustersResult = GetUserClustersSuccess | GetUserClustersError;

/**
 * Server Action: Get all clusters (grouped by location) for the current user.
 */
export async function getUserClusters(): Promise<GetUserClustersResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticación requerida.',
        },
      };
    }

    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('id, gps_latitude, gps_longitude, risk_level, created_at')
      .eq('user_id', user.id)
      .not('gps_latitude', 'is', null)
      .not('gps_longitude', 'is', null)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'No fue posible obtener los reportes.',
        },
      };
    }

    const groups = new Map<
      string,
      Array<{
        id: string;
        gps_latitude: number | null;
        gps_longitude: number | null;
        risk_level: string | null;
        created_at: string;
      }>
    >();

    for (const report of reports ?? []) {
      const geohash = toGeohash(report.gps_latitude, report.gps_longitude);
      if (!geohash) continue;

      const existing = groups.get(geohash);
      if (existing) {
        existing.push(report);
      } else {
        groups.set(geohash, [report]);
      }
    }

    const clusters = Array.from(groups.entries()).map(([clusterId, clusterReports]) => {
      const worstRisk = getWorstRisk(clusterReports);

      const sorted = [...clusterReports].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const recent = sorted.slice(0, 2);
      const previous = sorted.slice(2, 4);

      const riskOrder = ['critical', 'high', 'medium', 'low'] as const;
      let trend: 'worsening' | 'improving' | 'stable' = 'stable';

      if (recent.length > 0 && previous.length > 0) {
        const avgRecent =
          recent.reduce((sum, r) => {
            const risk = (r.risk_level ?? 'low') as (typeof riskOrder)[number];
            return sum + riskOrder.indexOf(risk);
          }, 0) / recent.length;
        const avgPrevious =
          previous.reduce((sum, r) => {
            const risk = (r.risk_level ?? 'low') as (typeof riskOrder)[number];
            return sum + riskOrder.indexOf(risk);
          }, 0) / previous.length;

        if (avgRecent < avgPrevious) trend = 'worsening';
        else if (avgRecent > avgPrevious) trend = 'improving';
      }

      return {
        clusterId,
        reportCount: clusterReports.length,
        worstRisk,
        trend,
        latestDate: sorted[0]?.created_at ?? '',
        latestReportId: sorted[0]?.id ?? '',
      };
    });

    return { success: true, clusters };
  } catch {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrio un error al obtener los hogares.',
      },
    };
  }
}
