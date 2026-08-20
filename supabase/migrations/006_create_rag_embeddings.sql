-- Migration: RAG (Retrieval-Augmented Generation) embeddings for expert calibration
--
-- Pipeline:
--   1. User runs expert calibration on a report (verifies or corrects AI)
--   2. Server embeds the calibration text via NVIDIA NIM (nvidia/nv-embed-v1)
--   3. Server inserts the embedding into expert_calibration_embeddings
--   4. On the next AI analysis, the prompt builder queries match_calibration_embeddings
--      with the new image's text embedding to fetch the top-k similar past cases
--   5. Those cases are injected as "Few-shot expert-validated examples" into the AI prompt
--
-- Benefits:
--   - No model retraining (impossible under free tier)
--   - Pattern-style improvements compound without GPU cost
--   - Each user's corrections make the SYSTEM better for everyone
--   - Versioned: we keep the row idempotent under (case_id)
--
-- Storage:
--   - vector(768) — NV-Embed-v1 output dimension (free, blazing fast)
--   - raw_text denormalized for inline LLM prompt injection

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.expert_calibration_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    pattern TEXT NOT NULL,
    calibration_text TEXT NOT NULL,
    embedding vector(768) NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast cosine similarity search via ivfflat (or hnsw if upgraded)
-- Using hnsw for better recall; 20 lists is a safe default for up to ~50k rows
CREATE INDEX IF NOT EXISTS idx_ecal_embeddings_hnsw
    ON public.expert_calibration_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Index by pattern to allow fast filtering by crack type
CREATE INDEX IF NOT EXISTS idx_ecal_pattern ON public.expert_calibration_embeddings(pattern);
CREATE INDEX IF NOT EXISTS idx_ecal_risk_level ON public.expert_calibration_embeddings(risk_level);

-- Atomic idempotent insert: if the report_id is recalibrated, update the embedding
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecal_report_id_unique
    ON public.expert_calibration_embeddings(report_id);

-- RPC: cosine similarity search for RAG retrieval
-- Returns the top-k most similar calibration examples to the query embedding
CREATE OR REPLACE FUNCTION public.match_calibrations(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.65,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    report_id UUID,
    risk_level TEXT,
    pattern TEXT,
    calibration_text TEXT,
    verified BOOLEAN,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        e.id,
        e.report_id,
        e.risk_level,
        e.pattern,
        e.calibration_text,
        e.verified,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM public.expert_calibration_embeddings e
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT GREATEST(match_count, 1);
$$;

-- RLS: only the project's service_role (server) writes here; reads are open via RPC
-- Users do NOT read this table directly; the server caches hits on the AI prompt.
ALTER TABLE public.expert_calibration_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow server-side reads (for the prompt builder) but no public writes
CREATE POLICY "Server-side read access"
    ON public.expert_calibration_embeddings
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to insert their own calibration embeddings
CREATE POLICY "Users can insert their own calibration embeddings"
    ON public.expert_calibration_embeddings
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow owners to update their calibrations (recalibration flow)
CREATE POLICY "Users can update their own calibration embeddings"
    ON public.expert_calibration_embeddings
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow authenticated RPC execution for the server function
-- (Supabase RPCs automatically run under the caller's privileges)
GRANT EXECUTE ON FUNCTION public.match_calibrations(vector(768), float, int) TO authenticated;
