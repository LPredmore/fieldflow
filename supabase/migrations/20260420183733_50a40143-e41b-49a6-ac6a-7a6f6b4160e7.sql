-- Expense category enum
CREATE TYPE public.expense_category AS ENUM (
  'material', 'mileage', 'subcontractor', 'equipment', 'permit', 'other'
);

-- job_expenses table
CREATE TABLE public.job_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  created_by_user_id uuid NOT NULL,
  job_series_id uuid NOT NULL REFERENCES public.job_series(id) ON DELETE CASCADE,
  job_occurrence_id uuid REFERENCES public.job_occurrences(id) ON DELETE SET NULL,
  category public.expense_category NOT NULL DEFAULT 'material',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  markup_percent numeric,
  billable boolean NOT NULL DEFAULT true,
  billed_to_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor text,
  receipt_file_id uuid REFERENCES public.job_files(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX idx_job_expenses_tenant_series ON public.job_expenses(tenant_id, job_series_id);
CREATE INDEX idx_job_expenses_occurrence ON public.job_expenses(job_occurrence_id);
CREATE INDEX idx_job_expenses_billed_invoice ON public.job_expenses(billed_to_invoice_id);
CREATE INDEX idx_job_expenses_billable_unbilled ON public.job_expenses(tenant_id, job_series_id) WHERE billable = true AND billed_to_invoice_id IS NULL;

-- updated_at trigger
CREATE TRIGGER trg_job_expenses_updated_at
BEFORE UPDATE ON public.job_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.job_expenses ENABLE ROW LEVEL SECURITY;

-- Admins: full access within tenant
CREATE POLICY "Admins manage all tenant expenses (select)"
ON public.job_expenses FOR SELECT
USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins manage all tenant expenses (insert)"
ON public.job_expenses FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins manage all tenant expenses (update)"
ON public.job_expenses FOR UPDATE
USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins manage all tenant expenses (delete)"
ON public.job_expenses FOR DELETE
USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

-- Contractors: SELECT/INSERT/UPDATE their own non-billed entries on jobs they're assigned to
CREATE POLICY "Contractors view own expenses on assigned jobs"
ON public.job_expenses FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id()
  AND created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_series js
    WHERE js.id = job_expenses.job_series_id
      AND js.assigned_to_user_id = auth.uid()
  )
);

CREATE POLICY "Contractors insert own expenses on assigned jobs"
ON public.job_expenses FOR INSERT
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  AND created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_series js
    WHERE js.id = job_expenses.job_series_id
      AND js.assigned_to_user_id = auth.uid()
  )
);

CREATE POLICY "Contractors update own non-billed expenses"
ON public.job_expenses FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id()
  AND created_by_user_id = auth.uid()
  AND billed_to_invoice_id IS NULL
);
