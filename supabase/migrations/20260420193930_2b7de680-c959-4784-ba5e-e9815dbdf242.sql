
-- 1. Add link/metadata columns
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.job_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_type public.job_service_type;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS billed_to_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.job_series
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

-- 2. Indexes for back-link lookups
CREATE INDEX IF NOT EXISTS idx_quotes_job_id ON public.quotes(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON public.invoices(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_series_quote_id ON public.job_series(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_billed_to_invoice_id ON public.time_entries(billed_to_invoice_id) WHERE billed_to_invoice_id IS NOT NULL;

-- 3. Aggregator function: returns one JSON blob with quote items + unbilled labor + unbilled expenses
CREATE OR REPLACE FUNCTION public.get_job_invoiceable_summary(_job_series_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _quote_items jsonb := '[]'::jsonb;
  _labor_items jsonb := '[]'::jsonb;
  _expense_items jsonb := '[]'::jsonb;
  _job_record record;
  _quote_record record;
BEGIN
  -- Tenant guard: ensure caller can see this job
  SELECT js.tenant_id, js.title, js.service_type, js.estimated_cost, js.quote_id, js.customer_id, js.customer_name
    INTO _job_record
  FROM public.job_series js
  WHERE js.id = _job_series_id
    AND js.tenant_id = public.get_user_tenant_id();

  IF _job_record IS NULL THEN
    RAISE EXCEPTION 'Job not found or access denied';
  END IF;

  -- Quote items (if linked to a quote)
  IF _job_record.quote_id IS NOT NULL THEN
    SELECT q.line_items, q.quote_number, q.title, q.subtotal
      INTO _quote_record
    FROM public.quotes q
    WHERE q.id = _job_record.quote_id;

    IF _quote_record.line_items IS NOT NULL THEN
      _quote_items := _quote_record.line_items;
    END IF;
  END IF;

  -- Unbilled labor: approved time entries not yet billed
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'source', 'labor',
      'time_entry_id', te.id,
      'user_id', te.user_id,
      'user_name', COALESCE(p.full_name, p.email, 'Contractor'),
      'hours', ROUND((te.duration_seconds / 3600.0)::numeric, 2),
      'hourly_rate', COALESCE(te.hourly_rate_snapshot, p.default_hourly_rate, 0),
      'description', 'Labor: ' || COALESCE(p.full_name, 'Contractor') || ' (' || ROUND((te.duration_seconds / 3600.0)::numeric, 2) || ' hrs)',
      'quantity', ROUND((te.duration_seconds / 3600.0)::numeric, 2),
      'unit_price', COALESCE(te.hourly_rate_snapshot, p.default_hourly_rate, 0),
      'total', ROUND((te.duration_seconds / 3600.0)::numeric, 2) * COALESCE(te.hourly_rate_snapshot, p.default_hourly_rate, 0)
    )
  ), '[]'::jsonb)
  INTO _labor_items
  FROM public.time_entries te
  LEFT JOIN public.profiles p ON p.id = te.user_id
  WHERE te.job_series_id = _job_series_id
    AND te.tenant_id = _job_record.tenant_id
    AND te.status = 'approved'
    AND te.billed_to_invoice_id IS NULL
    AND te.duration_seconds IS NOT NULL;

  -- Unbilled billable expenses
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'source', 'expense',
      'expense_id', e.id,
      'category', e.category,
      'description', '[' || initcap(e.category::text) || '] ' || e.description,
      'vendor', e.vendor,
      'quantity', e.quantity,
      'unit_cost', e.unit_cost,
      'markup_percent', COALESCE(e.markup_percent, 0),
      'unit_price', ROUND((e.unit_cost * (1 + COALESCE(e.markup_percent, 0) / 100.0))::numeric, 2),
      'total', ROUND((e.quantity * e.unit_cost * (1 + COALESCE(e.markup_percent, 0) / 100.0))::numeric, 2)
    )
  ), '[]'::jsonb)
  INTO _expense_items
  FROM public.job_expenses e
  WHERE e.job_series_id = _job_series_id
    AND e.tenant_id = _job_record.tenant_id
    AND e.billable = true
    AND e.billed_to_invoice_id IS NULL;

  RETURN jsonb_build_object(
    'job_series_id', _job_series_id,
    'job_title', _job_record.title,
    'service_type', _job_record.service_type,
    'customer_id', _job_record.customer_id,
    'customer_name', _job_record.customer_name,
    'quote_id', _job_record.quote_id,
    'quote_number', _quote_record.quote_number,
    'quote_items', _quote_items,
    'labor_items', _labor_items,
    'expense_items', _expense_items
  );
END;
$$;
