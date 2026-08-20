/**
 * RAG (Retrieval-Augmented Generation) — Few-Shot Calibration Retrieval
 *
 * Embeds user-confirmed or user-corrected crack analysis cases into a
 * pgvector-backed bank (`expert_calibration_embeddings`) and retrieves the
 * top-k semantically similar past cases to inject into the AI prompt.
 *
 * Embedding model: `nvidia/nv-embed-v1` (768 dim, free via NVIDIA NIM).
 * Search: cosine similarity via `public.match_calibrations(...)` RPC.
 *
 * Constraints:
 *   - Idempotent by report_id (UNIQUE index handles re-calibration).
 *   - pgvector ≥ 0.5 required at database level.
 *   - Runs in the server context (uses service_role via server client).
 *   - Failures here MUST NOT block the main capture flow — they degrade
 *     gracefully to "no examples injected" so the app keeps working offline.
 */

import { createServerSupabaseClient } from '@/lib/db/supabase';
import type { RiskLevel } from '@/lib/ai/types';

const NVIDIA_NIM_API_URL = 'https://integrate.api.nvidia.com/v1';
const EMBED_MODEL = 'nvidia/nv-embed-v1';
const EMBED_DIM = 768;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_TOP_K = 3;

export interface CalibrationExample {
  risk_level: RiskLevel;
  pattern: string;
  calibration_text: string;
  similarity: number;
}

function getApiKey(): string | null {
  const key =
    process.env.NVIDIA_NIM_API_KEY ?? process.env.nvidia_api ?? '';
  return key.trim() || null;
}

/**
 * Generate a 768-dim embedding vector for the given text.
 * Returns null if NIM is unavailable or the request fails (degraded mode).
 */
export async function generateEmbedding(
  text: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${NVIDIA_NIM_API_URL}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text,
        encoding_format: 'float',
        input_type: 'query',
      }),
      signal: controller.signal,
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const vector = data?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBED_DIM) return null;
    return vector as number[];
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build a compact, semantically rich text from a calibration entry.
 * Concatenating all relevant fields drives embedding quality.
 */
export function buildCalibrationText(input: {
  riskLevel: RiskLevel;
  pattern: string;
  isAccurate: boolean;
  notes?: string | null;
}): string {
  const verdict = input.isAccurate
    ? 'IA diagnostico correcto'
    : 'Correccion experta: IA subestimo o sobreestimo el riesgo';
  const parts = [
    verdict,
    `Patron: ${input.pattern}`,
    `Riesgo final verificado: ${input.riskLevel}`,
  ];
  if (input.notes && input.notes.trim().length > 0) {
    parts.push(`Observaciones tecnicas: ${input.notes.trim()}`);
  }
  return parts.join('. ');
}

/**
 * Insert or update a calibration entry in the RAG bank.
 * Idempotent: re-calibrating the same report_id overwrites the previous entry.
 */
export async function indexCalibration(input: {
  reportId: string;
  userId: string;
  riskLevel: RiskLevel;
  pattern: string;
  isAccurate: boolean;
  notes?: string | null;
}): Promise<{ indexed: boolean }> {
  const text = buildCalibrationText({
    riskLevel: input.riskLevel,
    pattern: input.pattern,
    isAccurate: input.isAccurate,
    notes: input.notes,
  });

  const embedding = await generateEmbedding(text);
  if (!embedding) {
    return { indexed: false };
  }

  const supabase = await createServerSupabaseClient();
  const formattedVector = `[${embedding.join(',')}]`;

  // Upsert via the unique index on report_id
  const { error } = await supabase
    .from('expert_calibration_embeddings')
    .upsert(
      {
        report_id: input.reportId,
        user_id: input.userId,
        risk_level: input.riskLevel,
        pattern: input.pattern,
        calibration_text: text,
        embedding: formattedVector,
        verified: true,
      },
      { onConflict: 'report_id' }
    );

  if (error) {
    return { indexed: false };
  }

  return { indexed: true };
}

/**
 * Query the top-k most similar calibrations to the given text.
 * Returns an empty array if embeddings are unavailable or no matches above threshold.
 */
export async function findSimilarCalibrations(
  input: { text: string; topK?: number; threshold?: number },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CalibrationExample[]> {
  const topK = input.topK ?? DEFAULT_TOP_K;
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;

  const queryEmbedding = await generateEmbedding(input.text, timeoutMs);
  if (!queryEmbedding) return [];

  const supabase = await createServerSupabaseClient();
  const formattedVector = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('match_calibrations', {
    query_embedding: formattedVector,
    match_threshold: threshold,
    match_count: topK,
  });

  if (error || !data) return [];

  return (data as Array<Omit<CalibrationExample, 'similarity' | 'risk_level'> & {
    risk_level: string;
    similarity: number;
  }>).map((row) => ({
    risk_level: row.risk_level as RiskLevel,
    pattern: row.pattern,
    calibration_text: row.calibration_text,
    similarity: row.similarity,
  }));
}

/**
 * Serialize the RAG examples into a deterministic prompt section.
 * Returns an empty string if no examples are available.
 */
export function buildRagSection(examples: CalibrationExample[]): string {
  if (examples.length === 0) return '';

  const lines = examples.map((ex, i) => {
    const verdict = ex.risk_level.toUpperCase();
    return `  Ejemplo ${i + 1} (similitud ${(ex.similarity * 100).toFixed(0)}%): ${ex.calibration_text}`;
  });

  return [
    'CASOS RECIENTES VERIFICADOS POR USUARIOS/PERITOS (ground truth):',
    'Cuando el caso actual sea estructural o visualmente similar a uno de estos ejemplos, usa la etiqueta de riesgo final como referencia fuerte (sin copiar literalmente, sino calibrando la incertidumbre).',
    ...lines,
  ].join('\n');
}
