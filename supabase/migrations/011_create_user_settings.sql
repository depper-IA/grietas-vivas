-- Migration 011: Create user_settings table for persistent BYOK config
--
-- Stores encrypted API key configurations per user. The API key is encrypted
-- server-side using pgcrypto's AES-256 with a key derived from the service role.
-- Each user has at most one settings row (upsert pattern).

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Encrypted BYOK config JSON (contains apiKey, provider, model, baseUrl, maxTokens)
  encrypted_config TEXT,
  -- Provider name in plaintext for display without decryption
  provider TEXT,
  -- Model name in plaintext for display without decryption
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One settings row per user
  CONSTRAINT user_settings_user_id_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own settings
CREATE POLICY "Users can read own settings"
  ON public.user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own settings"
  ON public.user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings"
  ON public.user_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own settings
CREATE POLICY "Users can delete own settings"
  ON public.user_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
