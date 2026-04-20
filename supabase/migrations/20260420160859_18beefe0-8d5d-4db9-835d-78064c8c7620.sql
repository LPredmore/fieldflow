-- Enum for time entry status
CREATE TYPE public.time_entry_status AS ENUM ('active', 'pending_approval', 'approved', 'rejected');

-- Add default_hourly_rate to profiles
ALTER TABLE public.profiles
  ADD COLUMN default_hourly_rate numeric;

-- time_entries table
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  job_occurrence_id uuid REFERENCES public.job_occurrences(id) ON DELETE SET NULL,
  job_series_id uuid REFERENCES public.job_series(id) ON DELETE SET NULL,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE
      WHEN clock_out_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (clock_out_at - clock_in_at))::integer
    END
  ) STORED,
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_in_accuracy_m numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  clock_out_accuracy_m numeric,
  notes text,
  status public.time_entry_status NOT NULL DEFAULT 'active',
  approved_by_user_id uuid,
  approved_at timestamptz,
  rejection_reason text,
  manual_entry boolean NOT NULL DEFAULT false,
  hourly_rate_snapshot numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX idx_time_entries_tenant ON public.time_entries(tenant_id);
CREATE INDEX idx_time_entries_user ON public.time_entries(user_id);
CREATE INDEX idx_time_entries_occurrence ON public.time_entries(job_occurrence_id);
CREATE INDEX idx_time_entries_series ON public.time_entries(job_series_id);
CREATE INDEX idx_time_entries_status ON public.time_entries(status);

-- One active entry per user
CREATE UNIQUE INDEX idx_time_entries_one_active_per_user
  ON public.time_entries(user_id)
  WHERE clock_out_at IS NULL;

-- updated_at trigger
CREATE TRIGGER trg_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clock_out_at IS NOT NULL AND NEW.clock_out_at < NEW.clock_in_at THEN
    RAISE EXCEPTION 'clock_out_at cannot be before clock_in_at';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Once approved, only admins may further mutate
    IF OLD.status = 'approved' AND NOT public.has_role(auth.uid(), 'business_admin'::user_role) THEN
      RAISE EXCEPTION 'Approved time entries can only be modified by an admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_time_entries_validate
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_time_entry();

-- RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors view own time entries"
  ON public.time_entries FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "Admins view all tenant time entries"
  ON public.time_entries FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
  );

CREATE POLICY "Contractors insert own time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "Admins insert any time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
  );

CREATE POLICY "Contractors update own non-approved time entries"
  ON public.time_entries FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND user_id = auth.uid()
    AND status <> 'approved'
  );

CREATE POLICY "Admins update tenant time entries"
  ON public.time_entries FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
  );

CREATE POLICY "Admins delete tenant time entries"
  ON public.time_entries FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
  );