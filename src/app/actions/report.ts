'use server';

import { createServerSupabaseClient } from '@/lib/db/supabase';
import type { SafeErrorResponse } from '@/lib/errors/types';

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
          message: 'No se pudo generar el reporte. Por favor intenta más tarde.',
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

    const { reportId, isAccurate, verifiedRiskLevel, verifiedPattern, notes } = data;

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
