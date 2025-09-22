-- Drop the existing jobs_calendar_upcoming view
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

-- Recreate the view with proper timezone handling for one-time jobs
CREATE VIEW public.jobs_calendar_upcoming AS
SELECT 
  js.id,
  js.title,
  js.description,
  -- For one-time jobs: properly convert from job's timezone to UTC
  (js.start_date::text || ' ' || js.local_start_time)::timestamp AT TIME ZONE js.timezone AT TIME ZONE 'UTC' AS start_at,
  ((js.start_date::text || ' ' || js.local_start_time)::timestamp AT TIME ZONE js.timezone AT TIME ZONE 'UTC' + (js.duration_minutes || ' minutes')::interval) AS end_at,
  js.status,
  js.priority,
  js.tenant_id,
  js.customer_id,
  js.customer_name,
  js.assigned_to_user_id,
  js.estimated_cost,
  js.actual_cost,
  js.completion_notes,
  'one_time'::text AS job_type,
  js.created_at,
  js.updated_at
FROM job_series js
WHERE js.active = true 
  AND js.is_recurring = false 
  AND js.start_date >= (CURRENT_DATE - INTERVAL '30 days')

UNION ALL

SELECT 
  jo.id,
  COALESCE(jo.override_title, js.title) AS title,
  COALESCE(jo.override_description, js.description) AS description,
  jo.start_at,
  jo.end_at,
  jo.status,
  jo.priority,
  jo.tenant_id,
  jo.customer_id,
  jo.customer_name,
  jo.assigned_to_user_id,
  COALESCE(jo.override_estimated_cost, js.estimated_cost) AS estimated_cost,
  jo.actual_cost,
  jo.completion_notes,
  'recurring'::text AS job_type,
  jo.created_at,
  jo.updated_at
FROM job_occurrences jo
JOIN job_series js ON jo.series_id = js.id
WHERE jo.start_at >= (CURRENT_DATE - INTERVAL '30 days')
  AND jo.start_at <= (CURRENT_DATE + INTERVAL '7 months');