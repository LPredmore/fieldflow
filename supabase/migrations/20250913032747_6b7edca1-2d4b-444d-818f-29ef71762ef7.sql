-- Create enum for job series if needed (reuse existing enums)

-- 1) Job Series table for recurring job templates
CREATE TABLE public.job_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,

  -- Job details
  title TEXT NOT NULL,
  customer_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  service_type job_service_type NOT NULL DEFAULT 'general_maintenance',
  description TEXT,

  -- Scheduling template in local wall time
  start_date DATE NOT NULL,
  local_start_time TIME NOT NULL DEFAULT '08:00',
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0) DEFAULT 60,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- iCalendar RRULE, e.g. 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'
  rrule TEXT NOT NULL,
  until_date DATE NULL,

  -- Job template defaults
  priority job_priority NOT NULL DEFAULT 'medium',
  assigned_to_user_id UUID NULL,
  estimated_cost NUMERIC(10,2),
  notes TEXT,
  
  -- Status
  active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.job_series ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for job_series
CREATE POLICY "Enable access for users within their tenant" 
ON public.job_series 
FOR SELECT 
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Allow authenticated users to insert within their tenant" 
ON public.job_series 
FOR INSERT 
WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Allow authenticated users to update within their tenant" 
ON public.job_series 
FOR UPDATE 
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Allow authenticated users to delete within their tenant" 
ON public.job_series 
FOR DELETE 
USING (tenant_id = get_user_tenant_id());

-- 2) Job Occurrences table for materialized instances
CREATE TABLE public.job_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  
  series_id UUID NOT NULL REFERENCES public.job_series(id) ON DELETE CASCADE,
  
  -- Concrete times in UTC (derived from local inputs + timezone + DST)
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  
  -- Operational state and overrides for "this visit only"
  status job_status NOT NULL DEFAULT 'scheduled',
  priority job_priority NOT NULL DEFAULT 'medium',
  assigned_to_user_id UUID NULL,
  override_title TEXT NULL,
  override_description TEXT NULL,
  override_estimated_cost NUMERIC(10,2) NULL,
  completion_notes TEXT NULL,
  actual_cost NUMERIC(10,2) NULL,
  
  -- Keep customer/service in sync for fast joins
  customer_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  
  -- Safeguards for idempotent generation
  UNIQUE (series_id, start_at)
);

-- Enable RLS
ALTER TABLE public.job_occurrences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for job_occurrences (mirror jobs table policies)
CREATE POLICY "Enable access for users within their tenant" 
ON public.job_occurrences 
FOR SELECT 
USING ((tenant_id = get_user_tenant_id()) AND 
       (((SELECT role FROM profiles WHERE id = auth.uid()) = 'business_admin') OR 
        (assigned_to_user_id = auth.uid())));

CREATE POLICY "Allow authenticated users to insert within their tenant" 
ON public.job_occurrences 
FOR INSERT 
WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Allow authenticated users to update within their tenant" 
ON public.job_occurrences 
FOR UPDATE 
USING ((tenant_id = get_user_tenant_id()) AND 
       (((SELECT role FROM profiles WHERE id = auth.uid()) = 'business_admin') OR 
        (assigned_to_user_id = auth.uid())));

CREATE POLICY "Allow authenticated users to delete within their tenant" 
ON public.job_occurrences 
FOR DELETE 
USING (tenant_id = get_user_tenant_id());

-- Add triggers for updated_at
CREATE TRIGGER update_job_series_updated_at
  BEFORE UPDATE ON public.job_series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_occurrences_updated_at
  BEFORE UPDATE ON public.job_occurrences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3) Unified calendar view that merges one-offs and recurring instances
CREATE OR REPLACE VIEW public.jobs_calendar_upcoming AS
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