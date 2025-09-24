-- Phase 1: Database Schema Optimization (Fixed)

-- 1.1 Drop the dependent view first
DROP VIEW IF EXISTS jobs_calendar_upcoming;

-- 1.2 Enhance job_series table with missing UTC columns
ALTER TABLE job_series 
ADD COLUMN IF NOT EXISTS scheduled_time_utc TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_end_time_utc TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending', 'generated', 'failed'));

-- 1.3 Add new columns to job_occurrences before dropping customer_name
ALTER TABLE job_occurrences 
ADD COLUMN IF NOT EXISTS series_timezone TEXT,
ADD COLUMN IF NOT EXISTS series_local_start_time TIME;

-- 1.4 Now safely drop the customer_name column
ALTER TABLE job_occurrences DROP COLUMN IF EXISTS customer_name;

-- 1.5 Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_job_occurrences_date_range ON job_occurrences (start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_job_occurrences_tenant_status ON job_occurrences (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_job_series_scheduled_time ON job_series (scheduled_time_utc);

-- 1.6 Update existing data to populate new UTC fields
UPDATE job_series 
SET scheduled_time_utc = 
  CASE 
    WHEN start_date IS NOT NULL AND local_start_time IS NOT NULL AND timezone IS NOT NULL THEN
      timezone(timezone, (start_date + local_start_time)::timestamp) AT TIME ZONE 'UTC'
    ELSE NULL
  END,
  scheduled_end_time_utc = 
  CASE 
    WHEN start_date IS NOT NULL AND local_start_time IS NOT NULL AND timezone IS NOT NULL AND duration_minutes IS NOT NULL THEN
      timezone(timezone, (start_date + local_start_time + (duration_minutes || ' minutes')::interval)::timestamp) AT TIME ZONE 'UTC'
    ELSE NULL
  END
WHERE scheduled_time_utc IS NULL;

-- 1.7 Recreate the calendar view with proper joins
CREATE VIEW jobs_calendar_upcoming AS
SELECT 
  CASE 
    WHEN js.is_recurring = false THEN js.id
    ELSE jo.id
  END as id,
  CASE 
    WHEN js.is_recurring = false THEN js.tenant_id
    ELSE jo.tenant_id
  END as tenant_id,
  CASE 
    WHEN js.is_recurring = false THEN js.customer_id
    ELSE jo.customer_id
  END as customer_id,
  CASE 
    WHEN js.is_recurring = false THEN js.assigned_to_user_id
    ELSE jo.assigned_to_user_id
  END as assigned_to_user_id,
  CASE 
    WHEN js.is_recurring = false THEN js.title
    ELSE COALESCE(jo.override_title, js.title)
  END as title,
  CASE 
    WHEN js.is_recurring = false THEN js.description
    ELSE COALESCE(jo.override_description, js.description)
  END as description,
  CASE 
    WHEN js.is_recurring = false THEN js.scheduled_time_utc
    ELSE jo.start_at
  END as start_at,
  CASE 
    WHEN js.is_recurring = false THEN js.scheduled_end_time_utc
    ELSE jo.end_at
  END as end_at,
  CASE 
    WHEN js.is_recurring = false THEN js.status
    ELSE jo.status
  END as status,
  CASE 
    WHEN js.is_recurring = false THEN js.priority
    ELSE jo.priority
  END as priority,
  CASE 
    WHEN js.is_recurring = false THEN js.estimated_cost
    ELSE COALESCE(jo.override_estimated_cost, js.estimated_cost)
  END as estimated_cost,
  CASE 
    WHEN js.is_recurring = false THEN js.actual_cost
    ELSE jo.actual_cost
  END as actual_cost,
  CASE 
    WHEN js.is_recurring = false THEN js.completion_notes
    ELSE jo.completion_notes
  END as completion_notes,
  CASE 
    WHEN js.is_recurring = false THEN 'one_time'
    ELSE 'recurring_instance'
  END as job_type,
  CASE 
    WHEN js.is_recurring = false THEN js.created_at
    ELSE jo.created_at
  END as created_at,
  CASE 
    WHEN js.is_recurring = false THEN js.updated_at
    ELSE jo.updated_at
  END as updated_at,
  -- Get customer name from customers table
  c.name as customer_name
FROM job_series js
LEFT JOIN job_occurrences jo ON js.id = jo.series_id
LEFT JOIN customers c ON COALESCE(jo.customer_id, js.customer_id) = c.id
WHERE 
  (js.is_recurring = false AND js.scheduled_time_utc IS NOT NULL)
  OR 
  (js.is_recurring = true AND jo.id IS NOT NULL);