-- Migration: Close the anon execute path on the RAG retrieval RPC
--
-- Regression introduced by 007:
--   007 made match_calibrations() SECURITY DEFINER (correct -- it must bypass
--   RLS to serve the prompt builder) and ran
--   `REVOKE ALL ... FROM PUBLIC`. That only drops the implicit PUBLIC grant.
--   Supabase's ALTER DEFAULT PRIVILEGES additionally issues EXPLICIT execute
--   grants to `anon`, `authenticated` and `service_role` at creation time, and
--   a REVOKE FROM PUBLIC does not touch those.
--
--   Net effect: the `anon` role kept EXECUTE on a SECURITY DEFINER function,
--   so an UNAUTHENTICATED caller holding the public anon key could POST to
--   /rest/v1/rpc/match_calibrations and read the whole bank, RLS bypassed.
--
-- Fix:
--   1. Explicitly revoke EXECUTE from `anon` (and PUBLIC, idempotently).
--   2. Clamp the caller-controlled search parameters inside the function.
--      Even an authenticated caller must not be able to pass
--      match_threshold = -1 / match_count = 9999 to dump every row: the RPC is
--      meant to return a few close matches, never to enumerate the bank.

-- 1. Recreate with clamped parameters -------------------------------------
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
SET search_path = public
AS $$
    SELECT
        e.risk_level,
        e.pattern,
        e.calibration_text,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM public.expert_calibration_embeddings e
    -- Floor the threshold at 0.5: a caller cannot widen the search to match
    -- semantically unrelated rows and walk the table.
    WHERE 1 - (e.embedding <=> query_embedding) > GREATEST(match_threshold, 0.5)
    ORDER BY e.embedding <=> query_embedding
    -- Cap the page size at 10 regardless of what the caller asks for.
    LIMIT LEAST(GREATEST(match_count, 1), 10);
$$;

-- 2. Grant execute to signed-in users ONLY --------------------------------
REVOKE ALL ON FUNCTION public.match_calibrations(vector(768), float, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_calibrations(vector(768), float, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.match_calibrations(vector(768), float, int) TO authenticated;

-- 3. Same treatment for the signup trigger function ------------------------
-- handle_new_user() is SECURITY DEFINER and inserts into public.users. It is
-- only ever meant to fire from the on_auth_user_created trigger, never to be
-- reachable as an API endpoint, so no client role needs EXECUTE on it.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- Note: public.rls_auto_enable() is a Supabase platform-managed event trigger
-- function. It returns `event_trigger`, so PostgREST cannot expose it as an
-- RPC endpoint and it is left untouched on purpose.
