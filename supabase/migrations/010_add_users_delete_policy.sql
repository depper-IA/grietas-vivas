-- Migration: Add missing DELETE policy for users table
--
-- 003_enable_rls.sql enabled RLS on public.users with SELECT/INSERT/UPDATE
-- policies but no DELETE policy. Without an explicit policy, RLS defaults
-- to deny — so this closes a gap in the CRUD policy set rather than an
-- active vulnerability.

CREATE POLICY "users_delete_own"
    ON public.users FOR DELETE
    USING (id = auth.uid());
