/**
 * Report Generator Edge Function — Type Definitions
 *
 * Types for the immutable PDF report generation with integrity hash.
 * Runs on Deno runtime (Supabase Edge Functions).
 */

/** GPS data embedded in the report. */
export interface GpsData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  available: boolean;
  reliable: boolean;
}

/** Device orientation data. */
export interface OrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  available: boolean;
}

/** Timestamp certification data. */
export interface TimestampData {
  local: string;
  server: string | null;
  verified: boolean;
}

/** Capture metadata included in the report. */
export interface CaptureMetadata {
  id: string;
  timestamp: TimestampData;
  gps: GpsData;
  orientation: OrientationData;
  deviceInfo: {
    userAgent: string;
    platform: string;
  };
}

/** Risk severity classification. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** AI analysis result included in the report. */
export interface AnalysisResult {
  riskLevel: RiskLevel;
  description: string;
  confidence: number;
  provider: string;
  analyzedAt: string;
}

/** Input payload for the generate-report Edge Function. */
export interface ReportInput {
  captureId: string;
  userId: string;
  imageStoragePath: string;
  metadata: CaptureMetadata;
  analysis: AnalysisResult;
}

/** Successful output from the generate-report Edge Function. */
export interface ReportOutput {
  reportId: string;
  pdfStoragePath: string;
  integrityHash: string;
  downloadUrl: string;
  generatedAt: string;
}

/** Structured error response (never exposes internals). */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: string[];
  };
}

/**
 * Canonical manifest hashed for the integrity_hash column.
 *
 * Key order is intentional and frozen. Any reordering of these properties
 * breaks byte-exact reproducibility of the SHA-256 hash, which is the
 * whole point of the manifest scheme. Do NOT use object spread to build
 * the manifest — always construct it via `buildManifest()`.
 */
export interface ReportManifest {
  captureId: string;
  userId: string;
  metadata: CaptureMetadata;
  analysis: AnalysisResult;
  generatedAt: string;
  pdfStoragePath: string;
}

/**
 * Builds the canonical `ReportManifest` for hashing.
 *
 * The output is byte-exact reproducible: same logical inputs always
 * serialize to the same JSON string. This is what makes the integrity
 * hash self-consistent — verifiers can reconstruct the manifest from
 * inputs + storage path and hash it again to validate.
 */
export function buildManifest(
  input: ReportInput,
  serverTimestamp: string,
  pdfStoragePath: string,
): ReportManifest {
  return {
    captureId: input.captureId,
    userId: input.userId,
    metadata: input.metadata,
    analysis: input.analysis,
    generatedAt: serverTimestamp,
    pdfStoragePath,
  };
}
