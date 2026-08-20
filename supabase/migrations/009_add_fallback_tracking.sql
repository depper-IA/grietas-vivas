-- Migration: Add fallback attempt tracking columns to users table
-- Tracks weekly usage of free fallback AI analysis

ALTER TABLE public.users
ADD COLUMN fallback_attempts_used INTEGER DEFAULT 0,
ADD COLUMN fallback_attempts_reset_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN public.users.fallback_attempts_used IS 'Number of fallback AI analysis used this week';
COMMENT ON COLUMN public.users.fallback_attempts_reset_at IS 'Timestamp when the weekly counter was last reset';
