-- Phase 1: Add rolling horizon tracking fields to job_series
ALTER TABLE public.job_series 
ADD COLUMN last_generated_until timestamptz,
ADD COLUMN generation_cap_days integer DEFAULT 90;

-- Set initial last_generated_until for existing active series
UPDATE public.job_series 
SET last_generated_until = CASE 
  WHEN until_date IS NOT NULL THEN LEAST(until_date::timestamptz, now() + interval '90 days')
  ELSE now() + interval '90 days'
END
WHERE active = true;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_job_series_horizon_tracking 
ON public.job_series (tenant_id, active, last_generated_until) 
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_job_occurrences_tenant_start 
ON public.job_occurrences (tenant_id, start_at);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_scheduled 
ON public.jobs (tenant_id, scheduled_date);