-- Migration: Create reports table with CHECK constraints and indexes

CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    gps_accuracy DOUBLE PRECISION,
    gps_reliable BOOLEAN DEFAULT false,
    sensor_metadata JSONB DEFAULT '{}'::jsonb,
    server_timestamp TIMESTAMPTZ,
    local_timestamp TIMESTAMPTZ NOT NULL,
    timestamp_verified BOOLEAN DEFAULT false,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    analysis_text TEXT NOT NULL CHECK (char_length(analysis_text) <= 2000),
    analysis_confidence DOUBLE PRECISION CHECK (analysis_confidence >= 0 AND analysis_confidence <= 1),
    analysis_provider TEXT NOT NULL,
    image_storage_path TEXT NOT NULL,
    pdf_storage_path TEXT,
    integrity_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'report_generated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_reports_user_id ON public.reports(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX idx_reports_risk_level ON public.reports(risk_level);
