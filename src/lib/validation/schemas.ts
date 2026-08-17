/**
 * Validation Schemas — Zod schemas for all input validation at service boundaries.
 *
 * Every external input (sync payloads, file names, analysis results, capture metadata)
 * is validated against these schemas before being processed.
 */

import { z } from 'zod';

/**
 * Re-exports del modulo `crackTaxonomy` para que los consumidores aguas
 * abajo (UI, actions, sync) puedan importar tipos y esquemas tributarios
 * desde una sola superficie (`@/lib/validation`). Mantiene `schemas.ts`
 * como punto unico de la frontera de validacion, pero evita imports
 * cruzados (no hay ciclos: `crackTaxonomy` no importa de `schemas`).
 *
 * Exporta `crackPatternSchema`, `dangerSignalsSchema`, tipos derivados
 * (`CrackPattern`, `DangerSignals`, `TriageOutcomeLevel`, `TriageOutcome`,
 * `AIRiskLevel`, `PatternMetadata`, `PatternRiskBaseline`) y la funcion
 * pura `evaluateSafetyOverride`.
 */
export {
  CRACK_PATTERN_VALUES,
  crackPatternSchema,
  dangerSignalsSchema,
  PATTERN_METADATA,
  evaluateSafetyOverride,
} from './crackTaxonomy';
export type {
  CrackPattern,
  DangerSignals,
  TriageOutcomeLevel,
  TriageOutcome,
  AIRiskLevel,
  PatternMetadata,
  PatternRiskBaseline,
} from './crackTaxonomy';

/** Risk classification for crack analysis: low, medium, high, or critical. */
export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

/** Structured result from an AI crack analysis provider. */
export const analysisResultSchema = z.object({
  riskLevel: riskLevelSchema,
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  provider: z.string(),
  analyzedAt: z.string().datetime(),
});

/**
 * Patron de grieta seleccionado por el usuario (slice 4 de
 * seismic-triage-upgrade). Opcional para retro-compatibilidad con
 * reportes generados antes del slice 4.
 */
const crackPatternFieldSchema = z
  .enum([
    'hairline_cosmetic',
    'vertical_shrinkage',
    'horizontal_flexural',
    'diagonal_shear',
    'stepped_masonry',
    'reentrant_corner',
    'interface_wall_column',
    'interface_wall_beam',
    'structural_beam_column',
    'spalling_corrosion',
  ])
  .optional();

/**
 * Senales de peligro capturadas en el checklist (slice 4). Opcional.
 */
const dangerSignalsFieldSchema = z
  .object({
    jammedDoorsWindows: z.boolean(),
    unleveledFloors: z.boolean(),
    tiltedElements: z.boolean(),
    exposedRebarSpalling: z.boolean(),
    throughWallXCracks: z.boolean(),
  })
  .strict()
  .optional();

/** Full capture metadata including timestamps, GPS, orientation, and device info. */
export const captureMetadataSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.object({
    local: z.string().datetime(),
    server: z.string().datetime().nullable(),
    verified: z.boolean(),
  }),
  gps: z.object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    accuracy: z.number().positive().nullable(),
    available: z.boolean(),
    reliable: z.boolean(),
  }),
  orientation: z.object({
    alpha: z.number().min(0).max(360).nullable(),
    beta: z.number().min(-180).max(180).nullable(),
    gamma: z.number().min(-90).max(90).nullable(),
    available: z.boolean(),
  }),
  deviceInfo: z.object({
    userAgent: z.string().max(1024),
    platform: z.string().max(255),
  }),
});

/**
 * File name validation with sanitization transform.
 * Strips all characters except [a-zA-Z0-9\-_.], enforces max 255, and rejects empty results.
 */
export const fileNameSchema = z
  .string()
  .max(255)
  .transform((val) => val.replace(/[^a-zA-Z0-9\-_.]/g, ''))
  .refine((val) => val.length > 0, 'File name cannot be empty after sanitization');

/**
 * Sync payload sent from client to server containing the image, metadata, and analysis.
 * imageBase64 max is ~13.7MB to accommodate a 10MB image encoded in base64.
 *
 * Campos opcionales del slice 4 (dual-foto + taxonomia):
 *   - contextImageBase64: segunda foto del flujo dual (R6). Si esta
 *     presente, imageBase64 contiene la foto de detalle.
 *   - pattern: patron de grieta seleccionado (R1).
 *   - dangerSignals: 5 booleanos de peligro (R3).
 *   - inspectionReportId: id compartido entre las dos fotos (R7).
 */
export const syncPayloadSchema = z.object({
  imageBase64: z.string().max(10 * 1024 * 1024 * 1.37),
  metadata: captureMetadataSchema,
  analysisResult: analysisResultSchema,
  contextImageBase64: z.string().max(10 * 1024 * 1024 * 1.37).optional(),
  pattern: crackPatternFieldSchema,
  dangerSignals: dangerSignalsFieldSchema,
  inspectionReportId: z.string().optional(),
});

/** Inferred types from schemas for type-safe usage across the application. */
export type RiskLevelSchema = z.infer<typeof riskLevelSchema>;
export type AnalysisResultSchema = z.infer<typeof analysisResultSchema>;
export type CaptureMetadataSchema = z.infer<typeof captureMetadataSchema>;
export type SyncPayloadSchema = z.infer<typeof syncPayloadSchema>;
