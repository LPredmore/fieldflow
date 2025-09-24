-- First, clear corrupted job occurrences with wrong timestamps
DELETE FROM job_occurrences WHERE series_id IN (
  SELECT id FROM job_series WHERE created_at > '2025-09-24 02:09:00+00'
);

-- Update jobs_calendar_upcoming view to handle non-recurring jobs properly
DROP VIEW IF EXISTS jobs_calendar_upcoming;

CREATE VIEW jobs_calendar_upcoming AS
-- Recurring job occurrences
SELECT 
  jo.id,
  jo.tenant_id,
  jo.customer_id,
  js.customer_name,
  jo.assigned_to_user_id,
  js.title,
  js.description,
  jo.start_at,
  jo.end_at,
  jo.status,
  jo.priority,
  js.estimated_cost,
  jo.actual_cost,
  jo.completion_notes,
  'recurring_instance' as job_type,
  jo.created_at,
  jo.updated_at
FROM job_occurrences jo
JOIN job_series js ON jo.series_id = js.id
WHERE jo.start_at IS NOT NULL
  AND js.active = true

UNION ALL

-- Non-recurring (one-time) jobs
SELECT 
  js.id,
  js.tenant_id,
  js.customer_id,
  js.customer_name,
  js.assigned_to_user_id,
  js.title,
  js.description,
  COALESCE(
    js.scheduled_time_utc,
    -- Fallback calculation if scheduled_time_utc is null
    (js.start_date || ' ' || js.local_start_time)::timestamp AT TIME ZONE js.timezone AT TIME ZONE 'UTC'
  ) as start_at,
  COALESCE(
    js.scheduled_end_time_utc,
    -- Fallback calculation if scheduled_end_time_utc is null
    ((js.start_date || ' ' || js.local_start_time)::timestamp AT TIME ZONE js.timezone AT TIME ZONE 'UTC') + (js.duration_minutes || ' minutes')::interval
  ) as end_at,
  js.status,
  js.priority,
  js.estimated_cost,
  js.actual_cost,
  js.completion_notes,
  'one_time' as job_type,
  js.created_at,
  js.updated_at
FROM job_series js
WHERE js.is_recurring = false
  AND js.active = true;