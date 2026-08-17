-- Migration: Enable Row Level Security and create access policies

-- Enable RLS on both tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Policies for users table
CREATE POLICY "users_select_own"
    ON public.users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "users_insert_own"
    ON public.users FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Policies for reports table
CREATE POLICY "reports_select_own"
    ON public.reports FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "reports_insert_own"
    ON public.reports FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "reports_update_own"
    ON public.reports FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "reports_delete_own"
    ON public.reports FOR DELETE
    USING (user_id = auth.uid());
