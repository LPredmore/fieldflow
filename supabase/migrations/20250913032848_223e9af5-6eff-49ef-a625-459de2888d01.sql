-- Fix the security definer view issue by dropping and recreating without SECURITY DEFINER
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

-- Recreate the unified calendar view without SECURITY DEFINER
CREATE VIEW public.jobs_calendar_upcoming AS
SELECT
  j.id,
  j.tenant_id,
  j.customer_id,
  j.customer_name,
  j.title,
  j.description,
  j.status,
  j.priority,
  j.assigned_to_user_id,
  j.service_type,
  j.estimated_cost,
  j.actual_cost,
  -- Convert date + time to timestamptz (assuming UTC for existing jobs)
  CASE 
    WHEN j.scheduled_time IS NOT NULL THEN
      (j.scheduled_date::text || ' ' || j.scheduled_time || ':00')::timestamptz
    ELSE
      (j.scheduled_date::text || ' 08:00:00')::timestamptz
  END as start_at,
  CASE 
    WHEN j.scheduled_time IS NOT NULL THEN
      (j.scheduled_date::text || ' ' || j.scheduled_time || ':00')::timestamptz + 
      (COALESCE(j.estimated_duration, 60)::text || ' minutes')::interval
    ELSE
      (j.scheduled_date::text || ' 08:00:00')::timestamptz + 
      (COALESCE(j.estimated_duration, 60)::text || ' minutes')::interval
  END as end_at,
  NULL::uuid as series_id,
  'single'::text as job_type,
  j.completion_notes,
  j.additional_info,
  j.created_at,
  j.updated_at
FROM public.jobs j
WHERE j.status IN ('scheduled', 'in_progress')

UNION ALL

SELECT
  o.id,
  o.tenant_id,
  o.customer_id,
  o.customer_name,
  COALESCE(o.override_title, s.title) as title,
  COALESCE(o.override_description, s.description) as description,
  o.status,
  o.priority,
  o.assigned_to_user_id,
  s.service_type,
  COALESCE(o.override_estimated_cost, s.estimated_cost) as estimated_cost,
  o.actual_cost,
  o.start_at,
  o.end_at,
  o.series_id,
  'recurring'::text as job_type,
  o.completion_notes,
  s.notes as additional_info,
  o.created_at,
  o.updated_at
FROM public.job_occurrences o
JOIN public.job_series s ON s.id = o.series_id
WHERE o.status IN ('scheduled', 'in_progress') AND s.active = true;