'use server';

import { createServerSupabaseClient } from '@/lib/db/supabase';
import { syncPayloadSchema, fileNameSchema } from '@/lib/validation/schemas';
import type { SafeErrorResponse } from '@/lib/errors/types';
import { randomUUID } from 'crypto';

/**
 * Result of a successful sync operation.
 */
export interface SyncCaptureSuccess {
  success: true;
  reportId: string;
  imageStoragePath: string;
}

/**
 * Result of a failed sync operation.
 */
export interface SyncCaptureError {
  success: false;
  error: SafeErrorResponse['error'];
}

export type SyncCaptureResult = SyncCaptureSuccess | SyncCaptureError;

/**
 * Server Action: Synchronize a local capture to the Supabase backend.
 *
 * 1. Validates the authenticated user session
 * 2. Validates input payload with Zod schemas
 * 3. Uploads the image to Supabase Storage (bucket: captures)
 * 4. Optionally uploads a second "context" image (dual-capture, slice 4)
 * 5. Persists complete metadata in the reports table
 * 6. Returns reportId and imageStoragePath on success
 *
 * Validates: Requirements 4.1, 4.2, 4.4, R5-R7 (seismic-triage-upgrade)
 */
export async function syncCapture(data: {
  imageBase64: string;
  metadata: unknown;
  analysisResult: unknown;
  contextImageBase64?: string;
  pattern?: string;
  dangerSignals?: {
    jammedDoorsWindows: boolean;
    unleveledFloors: boolean;
    tiltedElements: boolean;
    exposedRebarSpalling: boolean;
    throughWallXCracks: boolean;
  };
  inspectionReportId?: string;
}): Promise<SyncCaptureResult> {
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

    // 2. Validate input payload
    const validation = syncPayloadSchema.safeParse(data);

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = issue.message;
      }

      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid sync payload. Please check the submitted data.',
          fields: fieldErrors,
        },
      };
    }

    const {
      imageBase64,
      metadata,
      analysisResult,
      contextImageBase64,
      pattern,
      dangerSignals,
      inspectionReportId,
    } = validation.data;

    // 3. Decode base64 image and prepare for upload
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Generate a unique sanitized filename
    const rawFilename = `${metadata.id}.jpg`;
    const filenameValidation = fileNameSchema.safeParse(rawFilename);

    if (!filenameValidation.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Generated filename is invalid after sanitization.',
          fields: { filename: 'Filename cannot be empty after sanitization' },
        },
      };
    }

    const sanitizedFilename = filenameValidation.data;
    const storagePath = `${user.id}/${sanitizedFilename}`;

    // 4. Upload image to Supabase Storage (bucket: captures)
    const { error: uploadError } = await supabase.storage
      .from('captures')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Failed to upload image. Please try again later.',
        },
      };
    }

    // 4b. Upload segunda foto (contexto) si esta presente (R6, R7)
    let contextStoragePath: string | null = null;
    if (contextImageBase64) {
      const contextFilename = `${metadata.id}-context.jpg`;
      const ctxFilenameValidation = fileNameSchema.safeParse(contextFilename);
      if (ctxFilenameValidation.success) {
        const contextBuffer = Buffer.from(contextImageBase64, 'base64');
        const ctxPath = `${user.id}/${ctxFilenameValidation.data}`;
        const { error: ctxUploadError } = await supabase.storage
          .from('captures')
          .upload(ctxPath, contextBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (!ctxUploadError) {
          contextStoragePath = ctxPath;
        }
      }
    }

    // 5. Persist complete metadata in reports table
    const reportId = randomUUID();
    const serverTimestamp = new Date().toISOString();

    // Construye el sensor_metadata agregando datos del slice 4 si estan
    // presentes. Mantiene retro-compatibilidad con la forma legacy.
    const sensorMetadata = {
      orientation: metadata.orientation,
      deviceInfo: metadata.deviceInfo,
      ...(pattern ? { pattern } : {}),
      ...(dangerSignals ? { dangerSignals } : {}),
      ...(contextStoragePath ? { contextImageStoragePath: contextStoragePath } : {}),
      ...(inspectionReportId ? { inspectionReportId } : {}),
    };

    const { error: insertError } = await supabase.from('reports').insert({
      id: reportId,
      user_id: user.id,
      gps_latitude: metadata.gps.latitude,
      gps_longitude: metadata.gps.longitude,
      gps_accuracy: metadata.gps.accuracy,
      gps_reliable: metadata.gps.reliable,
      sensor_metadata: sensorMetadata,
      server_timestamp: serverTimestamp,
      local_timestamp: metadata.timestamp.local,
      timestamp_verified: metadata.timestamp.verified,
      risk_level: analysisResult.riskLevel,
      analysis_text: analysisResult.description,
      analysis_confidence: analysisResult.confidence,
      analysis_provider: analysisResult.provider,
      image_storage_path: storagePath,
      status: 'analyzed',
    });

    if (insertError) {
      // Attempt to clean up the uploaded image on DB failure
      await supabase.storage.from('captures').remove([storagePath]);
      if (contextStoragePath) {
        await supabase.storage.from('captures').remove([contextStoragePath]);
      }

      return {
        success: false,
        error: {
          code: 'PERSISTENCE_FAILED',
          message: 'Failed to save report data. Please try again later.',
        },
      };
    }

    // 6. Return success with reportId and storage path
    return {
      success: true,
      reportId,
      imageStoragePath: storagePath,
    };
  } catch {
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
