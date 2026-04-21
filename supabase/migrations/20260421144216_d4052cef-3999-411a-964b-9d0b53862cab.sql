
-- Enums
CREATE TYPE public.invoice_billing_mode AS ENUM ('flat_fee', 'per_visit_rollup');
CREATE TYPE public.invoice_schedule_status AS ENUM ('active', 'paused', 'ended');

-- Main table
CREATE TABLE public.invoice_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  customer_name text NOT NULL,

  name text NOT NULL,
  billing_mode public.invoice_billing_mode NOT NULL DEFAULT 'flat_fee',
  linked_job_series_ids uuid[] NOT NULL DEFAULT '{}',

  rrule text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  start_date date NOT NULL,
  until_date date,

  next_issue_at timestamptz,
  last_issued_at timestamptz,
  last_issued_invoice_id uuid,

  line_items_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_rate numeric NOT NULL DEFAULT 0.0875,
  payment_terms text NOT NULL DEFAULT 'Net 30',
  due_days_after_issue integer NOT NULL DEFAULT 30,
  notes_template text,

  auto_send boolean NOT NULL DEFAULT false,
  status public.invoice_schedule_status NOT NULL DEFAULT 'active',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Indexes
CREATE INDEX idx_invoice_schedules_tenant ON public.invoice_schedules(tenant_id);
CREATE INDEX idx_invoice_schedules_customer ON public.invoice_schedules(customer_id);
CREATE INDEX idx_invoice_schedules_due ON public.invoice_schedules(next_issue_at) WHERE status = 'active';

-- New columns on invoices
ALTER TABLE public.invoices
  ADD COLUMN generated_from_schedule_id uuid REFERENCES public.invoice_schedules(id) ON DELETE SET NULL,
  ADD COLUMN billing_period_start date,
  ADD COLUMN billing_period_end date;

-- Idempotency: prevent double-issuing for the same schedule + billing period
CREATE UNIQUE INDEX idx_invoices_schedule_period
  ON public.invoices(generated_from_schedule_id, billing_period_start)
  WHERE generated_from_schedule_id IS NOT NULL AND billing_period_start IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER update_invoice_schedules_updated_at
  BEFORE UPDATE ON public.invoice_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.invoice_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies (admins only)
CREATE POLICY "Admins view tenant invoice schedules"
  ON public.invoice_schedules FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins insert tenant invoice schedules"
  ON public.invoice_schedules FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins update tenant invoice schedules"
  ON public.invoice_schedules FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins delete tenant invoice schedules"
  ON public.invoice_schedules FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

-- Enable required extensions for cron-driven worker
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the recurring invoice generator hourly
SELECT cron.schedule(
  'generate-recurring-invoices-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/generate-recurring-invoices',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxb2huYWd2bnZwY3pkdW9pemRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQwOTgsImV4cCI6MjA3MzAwMDA5OH0.YYMJlLPl2yn8Khk3bTcwIHs2OQdAVUuYgAOgfvYeOqs"}'::jsonb,
    body := concat('{"triggered_at": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
