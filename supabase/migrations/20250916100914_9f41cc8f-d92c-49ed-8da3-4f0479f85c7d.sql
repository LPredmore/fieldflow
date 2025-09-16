-- Fix the security definer view issue by recreating the view with proper security
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

-- Create the view without security definer and ensure it respects RLS
CREATE VIEW public.jobs_calendar_upcoming 
WITH (security_barrier = true) AS
SELECT 
  -- For one-time jobs from job_series
  js.id,
  js.title,
  js.description,
  js.start_date::timestamp with time zone + js.local_start_time as start_at,
  js.start_date::timestamp with time zone + js.local_start_time + (js.duration_minutes || ' minutes')::interval as end_at,
  'scheduled'::job_status as status,
  js.priority,
  js.tenant_id,
  js.customer_id,
  js.customer_name,
  js.assigned_to_user_id,
  js.estimated_cost,
  null::numeric as actual_cost,
  null::text as completion_notes,
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

-- Enable RLS on the view
ALTER VIEW public.jobs_calendar_upcoming SET (security_barrier = true);

-- Add RLS policy for the view to ensure proper access control
CREATE POLICY "Enable access for users within their tenant" ON public.jobs_calendar_upcoming
    FOR SELECT USING (tenant_id = get_user_tenant_id());