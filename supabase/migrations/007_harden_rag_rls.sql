-- Migration: Harden RLS on the RAG calibration bank
--
-- Problem (security audit finding A01):
--   Migration 006 granted `SELECT ... TO authenticated USING (true)` on
--   expert_calibration_embeddings so the prompt builder could read the bank.
--   But `createServerSupabaseClient()` uses the ANON key with the caller's
--   cookie session -- NOT service_role -- so that policy also let any signed-in
--   user read every other user's rows straight through PostgREST:
--
--     supabase.from('expert_calibration_embeddings')
--             .select('user_id, report_id, calibration_text')
--
--   `calibration_text` embeds free-text notes the user wrote about their own
--   damaged building, correlated with user_id and report_id.
--
-- Fix:
--   1. Drop the blanket SELECT policy. With RLS enabled and no SELECT policy,
--      direct reads return zero rows for anon and authenticated alike.
--   2. Make match_calibrations() SECURITY DEFINER so RAG retrieval keeps
--      working through the RPC, which is the only intended read path.
--   3. Narrow the RPC result to the columns the prompt builder actually
--      consumes -- no id, no report_id, no user_id -- so a similarity search
--      can never be used to attribute a calibration back to its author.
--
-- Write access is unchanged: users still insert/update only their own rows.

-- 1. Remove the over-permissive read policy -------------------------------
DROP POLICY IF EXISTS "Server-side read access"
    ON public.expert_calibration_embeddings;

-- 2. Recreate the retrieval RPC as SECURITY DEFINER ------------------------
-- The return type changes, so the old signature must be dropped first.
DROP FUNCTION IF EXISTS public.match_calibrations(vector(768), float, int);

CREATE FUNCTION public.match_calibrations(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.65,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    risk_level TEXT,
    pattern TEXT,
    calibration_text TEXT,
    similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinning search_path is mandatory for SECURITY DEFINER: it stops a caller
-- from shadowing `public` with their own schema to hijack execution.
SET search_path = public
AS $$
    SELECT
        e.risk_level,
        e.pattern,
        e.calibration_text,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM public.expert_calibration_embeddings e
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT GREATEST(match_count, 1);
$$;

-- 3. Restrict who may execute the definer function -------------------------
REVOKE ALL ON FUNCTION public.match_calibrations(vector(768), float, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_calibrations(vector(768), float, int) TO authenticated;
