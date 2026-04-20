

## Plan: Job Costing & Profitability

Introduces expense tracking, materials tracking, and a unified cost ledger so every job rolls up to a margin number, and those margins aggregate up to customer-level and service-type-level profitability views.

---

### Data model

**New table: `job_expenses`** — all non-labor costs (materials, mileage, subcontractor fees, equipment rental, permits, misc).
- `id`, `tenant_id`, `created_at`, `updated_at`, `created_by_user_id`
- `job_series_id` (FK target — required; for one-time jobs this is the row in `job_series`, for recurring it's the parent series)
- `job_occurrence_id` (nullable FK target — set when the expense belongs to a specific occurrence rather than the whole series)
- `category` enum `expense_category`: `material` | `mileage` | `subcontractor` | `equipment` | `permit` | `other`
- `description` (text, required)
- `quantity` (numeric, default 1)
- `unit_cost` (numeric, required) — cost to the business
- `total_cost` (generated: `quantity * unit_cost`)
- `markup_percent` (numeric, nullable) — for materials being re-billed to customer
- `billable` (boolean, default true) — whether to roll into customer-facing invoice
- `billed_to_invoice_id` (uuid, nullable) — once invoiced, link back so we don't double-bill
- `expense_date` (date, default today)
- `vendor` (text, nullable)
- `receipt_file_id` (uuid, nullable — FK to `job_files` for the receipt photo/PDF)
- `notes` (text, nullable)

RLS: tenant-scoped; admins full access; contractors INSERT/SELECT/UPDATE their own non-billed entries on jobs they're assigned to.

**New view: `job_cost_summary`** — single source of truth for job profitability. Aggregates per `job_series_id`:
- `labor_hours` — sum of `time_entries.duration_seconds / 3600` where `status = 'approved'`
- `labor_cost` — sum of `(duration_seconds/3600) * COALESCE(hourly_rate_snapshot, profile.default_hourly_rate, 0)`
- `expense_total` — sum of `job_expenses.total_cost`
- `revenue` — sum of `invoices.total_amount` for invoices linked to this job (via `invoices.job_id`)
- `total_cost` = labor_cost + expense_total
- `gross_margin` = revenue - total_cost
- `margin_percent` = `gross_margin / NULLIF(revenue, 0) * 100`

Implemented as a SQL view (not a materialized view — needs to be live). Uses `SECURITY INVOKER` so existing RLS on underlying tables governs visibility.

**Two reporting RPCs** (security definer, tenant-scoped):
- `get_customer_profitability(date_from, date_to)` → per-customer revenue, cost, margin, job count.
- `get_service_type_profitability(date_from, date_to)` → per-service-type revenue, cost, margin, job count.

---

### UI

**1. New tab on `JobView.tsx`: "Costs & Profitability"**

Top: KPI strip — Revenue · Labor Cost · Expense Cost · Total Cost · Margin $ · Margin %. Color-coded margin (green if positive, red if negative).

Middle: "Expenses" section with table (Date · Category · Description · Vendor · Qty · Unit Cost · Total · Billable · Receipt) and "+ Add Expense" button → dialog with all `job_expenses` fields, optional receipt upload using existing `useJobFiles` hook.

Bottom: "Time Entries" summary (read from `time_entries`, links to existing Time Entries tab) and "Invoices" summary (revenue side).

**2. New page: `/profitability` (admin-only, added to `Navigation.tsx`)**

Three tabs:
- **By Job** — paginated table of all jobs with their `job_cost_summary` row; sortable by margin, filterable by date/customer/service type. Click row → opens JobView Costs tab.
- **By Customer** — `get_customer_profitability` results, sortable by margin/revenue. Click row → links to that customer's detail.
- **By Service Type** — `get_service_type_profitability` results as bar chart (revenue vs cost stacked) plus table.

Date range picker at top defaults to last 90 days. "Export CSV" button per tab.

**3. Invoice integration enhancement**

In invoice creation flow (when generating from a completed job), surface a checklist of `job_expenses` where `billable = true AND billed_to_invoice_id IS NULL`. Each checked item becomes a line item:
- Description: `[Material] {description}` 
- Quantity: `quantity`
- Unit price: `unit_cost * (1 + markup_percent/100)`

On invoice creation, set `billed_to_invoice_id` on the included expenses to prevent double-billing.

This composes with the labor-cost auto-injection from the prior plan — same dialog, two sections (Labor + Materials/Expenses).

**4. Customer page enhancement**

Small "Lifetime Profitability" card on `Customers.tsx` detail view showing total revenue, total cost, lifetime margin $/% — pulled from `get_customer_profitability` filtered to that customer.

---

### Hooks

- `useJobExpenses(jobSeriesId)` — list, create, update, delete; auto-uploads receipt to `job-attachments` bucket via existing `useJobFiles`.
- `useJobCostSummary(jobSeriesId)` — single-row fetch from `job_cost_summary` view, refetches on time-entry/expense/invoice mutations.
- `useProfitabilityReports(dateFrom, dateTo)` — wraps the two RPCs.

---

### Build order

1. Migration: `job_expenses` table + `expense_category` enum + RLS + indexes on `(tenant_id, job_series_id)` and `(billed_to_invoice_id)`.
2. Migration: `job_cost_summary` view + `get_customer_profitability` + `get_service_type_profitability` RPCs.
3. `useJobExpenses` + `useJobCostSummary` hooks.
4. `<JobExpensesTab />` and `<JobCostSummaryCard />` inside `JobView.tsx`.
5. `/profitability` page + nav link + CSV export.
6. Invoice flow: expense-selection step in invoice creation; mark `billed_to_invoice_id` on use.
7. Lifetime profitability card on customer detail.
8. End-to-end test: log time + add expenses on a job → mark complete → create invoice with labor + materials checked → verify margin numbers match across job, customer, service-type views.

---

### Out of scope this round

- Inventory/stock tracking (separate feature; expenses here are job-attached, not deducted from on-hand counts).
- Multi-currency.
- Tax-deductible flagging for accounting export — covered later in QuickBooks/Xero integration.
- Forecasted vs actual comparison charts (post-MVP).
- Profit goals / alerts when margin drops below threshold.

