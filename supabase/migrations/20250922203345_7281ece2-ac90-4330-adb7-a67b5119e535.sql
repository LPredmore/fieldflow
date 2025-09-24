-- Drop and recreate jobs_calendar_upcoming view with proper timestamptz handling
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

CREATE VIEW public.jobs_calendar_upcoming AS
WITH recurring_jobs AS (
  -- Recurring job occurrences from job_occurrences table
  SELECT 
    jo.id,
    jo.start_at,
    jo.end_at,
    jo.status,
    jo.priority,
    jo.tenant_id,
    jo.customer_id,
    jo.assigned_to_user_id,
    COALESCE(jo.override_title, js.title) AS title,
    COALESCE(jo.override_description, js.description) AS description,
    js.service_type::text AS job_type,
    jo.completion_notes,
    jo.customer_name,
    COALESCE(jo.override_estimated_cost, js.estimated_cost) AS estimated_cost,
    jo.actual_cost,
    jo.created_at,
    jo.updated_at
  FROM job_occurrences jo
  JOIN job_series js ON jo.series_id = js.id
  WHERE js.is_recurring = true
),
one_time_jobs AS (
  -- One-time jobs from job_series table, properly converted to timestamptz
  SELECT 
    js.id,
    -- Convert to timestamptz in the job's timezone, then to UTC
    ((js.start_date::text || ' ' || js.local_start_time)::timestamp AT TIME ZONE js.timezone) AS start_at,
    -- Add duration and convert to timestamptz in the job's timezone, then to UTC  
    (((js.start_date::text || ' ' || js.local_start_time)::timestamp + (js.duration_minutes || ' minutes')::interval) AT TIME ZONE js.timezone) AS end_at,
    js.status,
    js.priority,
    js.tenant_id,
    js.customer_id,
    js.assigned_to_user_id,
    js.title,
    js.description,
    js.service_type::text AS job_type,
    js.completion_notes,
    js.customer_name,
    js.estimated_cost,
    js.actual_cost,
    js.created_at,
    js.updated_at
  FROM job_series js
  WHERE js.is_recurring = false AND js.active = true
)
SELECT * FROM recurring_jobs
UNION ALL
SELECT * FROM one_time_jobs
ORDER BY start_at;