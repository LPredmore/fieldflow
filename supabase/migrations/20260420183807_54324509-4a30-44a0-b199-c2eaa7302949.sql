-- View: job_cost_summary
CREATE OR REPLACE VIEW public.job_cost_summary
WITH (security_invoker = true)
AS
WITH labor AS (
  SELECT
    te.tenant_id,
    te.job_series_id,
    SUM(te.duration_seconds) / 3600.0 AS labor_hours,
    SUM(
      (te.duration_seconds / 3600.0) *
      COALESCE(te.hourly_rate_snapshot, p.default_hourly_rate, 0)
    ) AS labor_cost
  FROM public.time_entries te
  LEFT JOIN public.profiles p ON p.id = te.user_id
  WHERE te.status = 'approved'
    AND te.duration_seconds IS NOT NULL
    AND te.job_series_id IS NOT NULL
  GROUP BY te.tenant_id, te.job_series_id
),
expenses AS (
  SELECT
    tenant_id,
    job_series_id,
    SUM(total_cost) AS expense_total
  FROM public.job_expenses
  GROUP BY tenant_id, job_series_id
),
rev AS (
  SELECT
    tenant_id,
    job_id AS job_series_id,
    SUM(total_amount) AS revenue
  FROM public.invoices
  WHERE job_id IS NOT NULL
    AND status <> 'cancelled'
  GROUP BY tenant_id, job_id
)
SELECT
  js.id AS job_series_id,
  js.tenant_id,
  js.title,
  js.customer_id,
  js.customer_name,
  js.service_type,
  js.status,
  js.start_date,
  COALESCE(l.labor_hours, 0) AS labor_hours,
  COALESCE(l.labor_cost, 0) AS labor_cost,
  COALESCE(e.expense_total, 0) AS expense_total,
  COALESCE(r.revenue, 0) AS revenue,
  COALESCE(l.labor_cost, 0) + COALESCE(e.expense_total, 0) AS total_cost,
  COALESCE(r.revenue, 0) - (COALESCE(l.labor_cost, 0) + COALESCE(e.expense_total, 0)) AS gross_margin,
  CASE
    WHEN COALESCE(r.revenue, 0) = 0 THEN NULL
    ELSE ((COALESCE(r.revenue, 0) - (COALESCE(l.labor_cost, 0) + COALESCE(e.expense_total, 0))) / r.revenue) * 100
  END AS margin_percent
FROM public.job_series js
LEFT JOIN labor l ON l.job_series_id = js.id
LEFT JOIN expenses e ON e.job_series_id = js.id
LEFT JOIN rev r ON r.job_series_id = js.id;

-- Customer profitability RPC
CREATE OR REPLACE FUNCTION public.get_customer_profitability(
  date_from date DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  date_to date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  revenue numeric,
  total_cost numeric,
  gross_margin numeric,
  margin_percent numeric,
  job_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cs.customer_id,
    MAX(cs.customer_name) AS customer_name,
    SUM(cs.revenue) AS revenue,
    SUM(cs.total_cost) AS total_cost,
    SUM(cs.revenue) - SUM(cs.total_cost) AS gross_margin,
    CASE WHEN SUM(cs.revenue) = 0 THEN NULL
      ELSE ((SUM(cs.revenue) - SUM(cs.total_cost)) / SUM(cs.revenue)) * 100
    END AS margin_percent,
    COUNT(*) AS job_count
  FROM public.job_cost_summary cs
  WHERE cs.tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
    AND cs.start_date BETWEEN date_from AND date_to
  GROUP BY cs.customer_id
  ORDER BY gross_margin DESC NULLS LAST;
$$;

-- Service type profitability RPC
CREATE OR REPLACE FUNCTION public.get_service_type_profitability(
  date_from date DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  date_to date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  service_type job_service_type,
  revenue numeric,
  total_cost numeric,
  gross_margin numeric,
  margin_percent numeric,
  job_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cs.service_type,
    SUM(cs.revenue) AS revenue,
    SUM(cs.total_cost) AS total_cost,
    SUM(cs.revenue) - SUM(cs.total_cost) AS gross_margin,
    CASE WHEN SUM(cs.revenue) = 0 THEN NULL
      ELSE ((SUM(cs.revenue) - SUM(cs.total_cost)) / SUM(cs.revenue)) * 100
    END AS margin_percent,
    COUNT(*) AS job_count
  FROM public.job_cost_summary cs
  WHERE cs.tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
    AND cs.start_date BETWEEN date_from AND date_to
  GROUP BY cs.service_type
  ORDER BY gross_margin DESC NULLS LAST;
$$;
