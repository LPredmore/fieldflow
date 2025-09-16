-- Drop the existing jobs_calendar_upcoming view that references the old jobs table
DROP VIEW IF EXISTS public.jobs_calendar_upcoming;

-- Create a new jobs_calendar_upcoming view that combines data from job_series and job_occurrences
CREATE VIEW public.jobs_calendar_upcoming AS
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

-- Update the invoices table job_id foreign key constraint to reference job_occurrences if needed
-- First check if there's an existing constraint and drop it
DO $$
BEGIN
  -- Remove any existing foreign key constraint on job_id in invoices table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%invoices_job_id%' 
    AND table_name = 'invoices'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_job_id_fkey;
  END IF;
END
$$;

-- Add comment to clarify that job_id in invoices can reference either job_series (one-time) or job_occurrences (recurring)
COMMENT ON COLUMN public.invoices.job_id IS 'References either job_series.id for one-time jobs or job_occurrences.id for recurring job instances';