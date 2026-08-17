-- Migration: Create storage buckets with access policies

-- Create private buckets for captures (images) and reports (PDFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('captures', 'captures', false);

INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false);

-- Policy: Users can only access files under their own {user_id}/ folder in captures bucket
CREATE POLICY "captures_user_access"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'captures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'captures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Users can only access files under their own {user_id}/ folder in reports bucket
CREATE POLICY "reports_user_access"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'reports'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'reports'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Note: Edge Functions access storage via service_role key which bypasses RLS entirely.
-- No additional policy is needed for server-side operations.
