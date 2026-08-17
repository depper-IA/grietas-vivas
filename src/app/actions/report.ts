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
          message: 'Authentication required. Please log in and try again.',
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
          message: 'A valid capture ID is required.',
          fields: { captureId: 'Capture ID must be a non-empty string' },
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
          message: 'Report not found. Please verify the capture ID and try again.',
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
          message: 'Service is temporarily unavailable. Please try again later.',
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
            message: errorBody.error.message || 'Report generation failed due to missing fields.',
            fields: errorBody.error.fields,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: 'Failed to generate the report. Please try again later.',
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
          message: 'Report generation timed out. Please try again later.',
        },
      };
    }

    // Never expose internal error details
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
      },
    };
  }
}
