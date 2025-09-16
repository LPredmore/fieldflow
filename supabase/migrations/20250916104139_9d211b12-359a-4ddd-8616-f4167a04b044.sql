-- Add missing columns to job_series table to support one-time jobs properly
ALTER TABLE public.job_series 
ADD COLUMN IF NOT EXISTS actual_cost numeric,
ADD COLUMN IF NOT EXISTS status job_status DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS completion_notes text;

-- Update the jobs_calendar_upcoming view to use the new columns properly
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

CREATE VIEW public.jobs_calendar_upcoming 
WITH (security_barrier = true) AS
SELECT 
  -- For one-time jobs from job_series
  js.id,
  js.title,
  js.description,
  js.start_date::timestamp with time zone + js.local_start_time as start_at,
  js.start_date::timestamp with time zone + js.local_start_time + (js.duration_minutes || ' minutes')::interval as end_at,
  js.status,
  js.priority,
  js.tenant_id,
  js.customer_id,
  js.customer_name,
  js.assigned_to_user_id,
  js.estimated_cost,
  js.actual_cost,
  js.completion_notes,
  'one_time'::text as job_type,
  js.created_at,
  js.updated_at
FROM public.job_series js
WHERE js.active = true 
  AND js.is_recurring = false
  AND js.start_date >= CURRENT_DATE - INTERVAL '30 days'

UNION ALL

SELECT 
  -- For recurring job occurrences
  jo.id,
  COALESCE(jo.override_title, js.title) as title,
  COALESCE(jo.override_description, js.description) as description,
  jo.start_at,
  jo.end_at,
  jo.status,
  jo.priority,
  jo.tenant_id,
  jo.customer_id,
  jo.customer_name,
  jo.assigned_to_user_id,
  COALESCE(jo.override_estimated_cost, js.estimated_cost) as estimated_cost,
  jo.actual_cost,
  jo.completion_notes,
  'recurring'::text as job_type,
  jo.created_at,
  jo.updated_at
FROM public.job_occurrences jo
JOIN public.job_series js ON jo.series_id = js.id
WHERE jo.start_at >= CURRENT_DATE - INTERVAL '30 days'
  AND jo.start_at <= CURRENT_DATE + INTERVAL '7 months';