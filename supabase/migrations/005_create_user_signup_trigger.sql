-- Migration: Auto-create public.users row when a new auth user signs up
-- This fixes the foreign key constraint violation when inserting reports
-- (reports.user_id references public.users.id, which must exist before the insert).

-- Trigger function: extract email and use email prefix as default display_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING; -- Idempotent: safe for existing users

    RETURN NEW;
END;
$$;

-- Trigger fires on every new auth user (after insert)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Backfill: insert public.users rows for auth users that signed up before
-- this trigger existed. ON CONFLICT skips users that already exist.
INSERT INTO public.users (id, email, display_name)
SELECT
    au.id,
    au.email,
    COALESCE(
        au.raw_user_meta_data->>'display_name',
        split_part(au.email, '@', 1)
    )
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;