-- Phase 1: Add is_recurring field to job_series table
ALTER TABLE public.job_series 
ADD COLUMN is_recurring boolean NOT NULL DEFAULT true;

-- Migrate existing one-time jobs from jobs table to job_series table
INSERT INTO public.job_series (
  id,
  tenant_id,
  created_by_user_id,
  customer_id,
  customer_name,
  title,
  description,
  service_type,
  priority,
  assigned_to_user_id,
  estimated_cost,
  notes,
  start_date,
  local_start_time,
  duration_minutes,
  timezone,
  rrule,
  active,
  is_recurring,
  created_at,
  updated_at
)
SELECT 
  j.id,
  j.tenant_id,
  j.created_by_user_id,
  j.customer_id,
  j.customer_name,
  j.title,
  j.description,
  j.service_type,
  j.priority,
  j.assigned_to_user_id,
  j.estimated_cost,
  j.additional_info as notes,
  j.scheduled_date as start_date,
  -- Extract time portion from scheduled_time if it's a timestamp, otherwise default to 08:00
  CASE 
    WHEN j.scheduled_time IS NOT NULL THEN
      CASE 
        WHEN j.scheduled_time ~ '^\d{2}:\d{2}(:\d{2})?$' THEN j.scheduled_time::time
        ELSE (j.scheduled_time::timestamp)::time
      END
    ELSE '08:00:00'::time
  END as local_start_time,
  COALESCE(EXTRACT(EPOCH FROM j.estimated_duration * INTERVAL '1 hour') / 60, 60)::integer as duration_minutes,
  'America/New_York' as timezone,
  'FREQ=DAILY;COUNT=1' as rrule, -- Single occurrence rule
  true as active,
  false as is_recurring, -- Mark as non-recurring
  j.created_at,
  j.updated_at
FROM public.jobs j;

-- Create job_occurrences for each migrated one-time job
INSERT INTO public.job_occurrences (
  id,
  series_id,
  tenant_id,
  customer_id,
  customer_name,
  assigned_to_user_id,
  priority,
  status,
  start_at,
  end_at,
  actual_cost,
  completion_notes,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  j.id as series_id,
  j.tenant_id,
  j.customer_id,
  j.customer_name,
  j.assigned_to_user_id,
  j.priority,
  j.status,
  -- Combine date and time for start_at, handling both time and timestamp formats
  CASE 
    WHEN j.scheduled_time IS NOT NULL THEN
      CASE 
        WHEN j.scheduled_time ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
          (j.scheduled_date::text || ' ' || j.scheduled_time)::timestamp AT TIME ZONE 'America/New_York'
        ELSE
          j.scheduled_time::timestamp AT TIME ZONE 'America/New_York'
      END
    ELSE
      (j.scheduled_date::text || ' 08:00:00')::timestamp AT TIME ZONE 'America/New_York'
  END as start_at,
  -- Calculate end_at based on estimated_duration or default to 1 hour
  CASE 
    WHEN j.scheduled_time IS NOT NULL THEN
      CASE 
        WHEN j.scheduled_time ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
          (j.scheduled_date::text || ' ' || j.scheduled_time)::timestamp AT TIME ZONE 'America/New_York' 
          + COALESCE(j.estimated_duration * INTERVAL '1 hour', INTERVAL '1 hour')
        ELSE
          j.scheduled_time::timestamp AT TIME ZONE 'America/New_York'
          + COALESCE(j.estimated_duration * INTERVAL '1 hour', INTERVAL '1 hour')
      END
    ELSE
      (j.scheduled_date::text || ' 08:00:00')::timestamp AT TIME ZONE 'America/New_York' + INTERVAL '1 hour'
  END as end_at,
  j.actual_cost,
  j.completion_notes,
  j.created_at,
  j.updated_at
FROM public.jobs j;

-- Update any invoices that reference jobs to reference job_occurrences instead
-- First, we need to get the occurrence IDs that were just created
UPDATE public.invoices 
SET job_id = (
  SELECT jo.id 
  FROM public.job_occurrences jo 
  WHERE jo.series_id = invoices.job_id 
  LIMIT 1
)
WHERE job_id IN (SELECT id FROM public.jobs);

-- Drop the jobs table after successful migration
DROP TABLE public.jobs;