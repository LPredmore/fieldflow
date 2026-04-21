

## Recurring Invoicing for Maintenance Contracts

### What changes for the user

Business admins can attach a **billing schedule** to any customer (or to an existing recurring job series). On a defined cadence — monthly, quarterly, yearly, or "after every Nth completed job" — the system auto-generates a draft invoice from a saved line-item template and (optionally) auto-sends it to the customer. A new "Recurring" tab on the Invoices page lists all active billing schedules, shows next-issue dates, last-issued dates, pause/resume controls, and the chain of invoices each schedule has produced.

Lawn care, pool, and HVAC scenarios all collapse to one of two patterns this covers:

1. **Flat-fee maintenance contract** — "$120 the 1st of every month, regardless of visits."
2. **Per-visit billing rollup** — "Every month, invoice for the visits we completed that month" (uses the existing unbilled labor/expenses engine in `get_job_invoiceable_summary`).

### Definitive technical decision

**Build a new `invoice_schedules` table with an RRULE-driven cron worker that generates native rows in the existing `invoices` table — do NOT use Stripe Subscriptions, and do NOT extend `job_series` to also represent billing.**

Why this and not the alternatives:

1. **Native invoices over Stripe Subscriptions.** The app already has a complete invoice lifecycle (draft → sent → paid → overdue), public share tokens, PDF preview, email delivery via Resend, in-app payment via Stripe Connect Checkout, an admin Invoices page, a client portal Invoices page, profitability reports, RLS, audit logs, and tax handling. Stripe Subscriptions would force a second, parallel billing system: subscription objects living only in Stripe, products/prices that have to be mirrored, customer.subscription.* webhooks the app currently doesn't handle, no concept of "draft for review before send", no way to roll up the per-visit unbilled labor pattern (Stripe can't see `time_entries`), and no support for tenants who haven't connected Stripe at all (the app already works invoice-only with Venmo/PayPal/manual). Treating recurrence as **invoice generation** keeps one source of truth and reuses everything that already works, including the just-built Pay Now flow.

2. **Separate `invoice_schedules` table over extending `job_series`.** They have different lifecycles. A job series can run for years with no billing (e.g., warranty visits), and one billing schedule can roll up *multiple* job series for the same customer (a customer with both a lawn series and a pool series who gets one monthly invoice). Cramming billing fields into `job_series` would also break the existing recurring-job UI and the cost summary RPC. A dedicated table mirrors the clean `job_series` / `job_occurrences` split: `invoice_schedules` (the rule) + `invoices` (the materialized output).

3. **RRULE + pg_cron worker over per-tenant schedulers.** The codebase already uses `rrule@2.8.1` and Luxon in `generate-job-occurrences-enhanced` and a daily horizon-extension worker in `extend-horizon`. Using the same pattern for invoices means one mental model, identical timezone handling, and a worker an admin already understands. Using pg_cron + `net.http_post` to invoke the worker is the canonical Lovable Cloud pattern (already documented in this project's knowledge).

4. **Generate as `draft` by default, with opt-in `auto_send`.** Maintenance contracts often have last-minute adjustments (extra trip charges, materials). Auto-generating to draft preserves human review; tenants who want zero-touch billing flip `auto_send = true` per schedule. This matches how `job_occurrences` are pre-generated but never auto-completed.

5. **Per-visit rollup uses the existing unbilled-items engine.** `get_job_invoiceable_summary` already returns `labor_items + expense_items` for a job series with `billed_to_invoice_id IS NULL`. The worker for `billing_mode = 'per_visit_rollup'` simply calls this RPC for each linked series within the period window and stamps `billed_to_invoice_id` on the consumed time entries and expenses — the exact bookkeeping the manual flow already does.

### Data model

New table `invoice_schedules`:

```text
id                     uuid pk
tenant_id              uuid       (RLS by get_user_tenant_id)
created_by_user_id     uuid
customer_id            uuid       (the bill-to customer)
customer_name          text       (snapshot, mirrors invoices)

name                   text       e.g. "Lawn maintenance — Smiths"
billing_mode           enum('flat_fee','per_visit_rollup')
linked_job_series_ids  uuid[]     null for flat_fee; required for per_visit_rollup

# Schedule definition (mirrors job_series convention)
rrule                  text       e.g. FREQ=MONTHLY;BYMONTHDAY=1
timezone               text       default 'America/New_York'
start_date             date       first issue date
until_date             date       null = indefinite
next_issue_at          timestamptz computed/maintained by worker
last_issued_at         timestamptz null
last_issued_invoice_id uuid       null

# Invoice template (used for flat_fee, and as overrides for rollup)
line_items_template    jsonb      same shape as invoices.line_items
tax_rate               numeric    default 0.0875
payment_terms          text       default 'Net 30'
due_days_after_issue   integer    default 30
notes_template         text

# Behavior
auto_send              boolean    default false (false = draft for review)
status                 enum('active','paused','ended')  default 'active'

created_at, updated_at timestamps
```

New columns on `invoices`:

```text
generated_from_schedule_id  uuid    null   (links back to schedule)
billing_period_start        date    null   (for rollup invoices)
billing_period_end          date    null   (for rollup invoices)
```

RLS: same tenant-scoped policies as `invoices` — admins manage, contractors no-access (billing is admin-only). Clients see only the resulting invoices through their existing `is_customer_owned_by_client` invoice policy; they never see `invoice_schedules`.

### Generation worker

New edge function `generate-recurring-invoices` (modeled on `extend-horizon` + `generate-job-occurrences-enhanced`):

```text
For each invoice_schedules row WHERE status='active' AND next_issue_at <= now():
  if billing_mode = 'flat_fee':
      build line_items from line_items_template
  if billing_mode = 'per_visit_rollup':
      for each series in linked_job_series_ids:
          call get_job_invoiceable_summary(series_id)
          merge labor_items + expense_items into line_items
          if line_items empty: skip this cycle (log + advance next_issue_at)
          else: stamp billed_to_invoice_id on consumed records after insert

  insert into invoices (status='draft', generated_from_schedule_id, billing_period_*, share_token, ...)
  if schedule.auto_send: invoke send-invoice-email with generateTokenOnly=false
  update schedule: last_issued_at, last_issued_invoice_id, next_issue_at = RRule.after(now)
  if next_issue_at > until_date: status='ended'
```

Scheduled via pg_cron hourly (matches the cadence guidance in the project knowledge file). Hourly is fine because the worker idempotently picks up everything `<= now()`; the chosen issue *date* is what the customer sees on the invoice, not the worker tick time.

Idempotency: a unique partial index on `(generated_from_schedule_id, billing_period_start)` prevents double-issuing if the worker runs twice in the same window.

### UI surface

- **Invoices page** — add a `Tabs` row: "Invoices" (existing) | "Recurring". The Recurring tab is a list of `invoice_schedules` with columns: Name, Customer, Cadence (humanized from RRULE), Next issue, Last issued, Auto-send, Status. Row actions: Edit, Pause/Resume, "Generate now" (manual trigger), View generated invoices.
- **New `RecurringInvoiceScheduleForm`** — reuses `CustomerSelector`, `RRuleBuilder` (already exists for jobs), the line-item editor pattern from `InvoiceForm`, plus a billing-mode radio and a multi-select of the customer's job series (only shown when `per_visit_rollup`).
- **Invoice card / preview** — when an invoice has `generated_from_schedule_id`, show a small "Recurring · {schedule name}" badge so admins know not to manually duplicate it.
- **Client portal** — no new screens. Generated invoices already flow through `ClientInvoices.tsx` via the existing client RLS policy and Pay Now button.

### Edge cases handled

- **Tenant has no Stripe connected.** Generated invoices behave exactly like manually created ones: client sees the helper text from the recently built `useStripeAvailability`, can pay via Venmo/PayPal/manual per existing settings.
- **Per-visit rollup with zero completed visits in the window.** Worker logs and advances `next_issue_at` without inserting an empty invoice (configurable later; defaulting to "skip" is the right call so customers aren't billed $0).
- **Schedule edited mid-cycle.** Edits affect future issues only; already-issued invoices are immutable bills, matching how the existing manual invoice edit flow works.
- **Schedule deleted while invoices exist.** Soft-end via `status='ended'`. Hard delete is allowed (cascade safe — `generated_from_schedule_id` is `ON DELETE SET NULL`) so the historical invoices survive.
- **Worker downtime.** On next run it issues every overdue cycle in order, each with the correct `billing_period_*` for that cycle, then advances. `RRule.between(last_issued_at, now())` produces the missed dates.
- **Customer has multiple linked series, one is paused.** Rollup naturally returns no items for the paused series; remaining series still bill.
- **Tax rate change on the schedule.** Applied to the next generated invoice; past invoices keep their snapshot — same semantics as manual invoices.

### Files to create / change

```text
supabase/migrations/<ts>_recurring_invoices.sql       (new table, columns, RLS, indexes, pg_cron)
supabase/functions/generate-recurring-invoices/       (new edge function)
src/hooks/useInvoiceSchedules.tsx                     (new — mirrors useJobSeries pattern)
src/components/Invoices/RecurringInvoiceScheduleForm.tsx   (new)
src/components/Invoices/RecurringInvoicesList.tsx     (new — table view)
src/pages/Invoices.tsx                                (add Tabs: Invoices | Recurring)
src/components/Invoices/InvoiceCard.tsx               (add "Recurring" badge when generated_from_schedule_id set)
src/components/Invoices/InvoicePreview.tsx            (show billing period if present)
```

No changes to existing edge functions, the Stripe webhook, the client portal pages, RLS on `invoices`, or `useInvoices` (the hook continues to list everything; the schedule is metadata on top).

### What this explicitly does NOT include (and why)

- **Stripe auto-charge / saved cards.** Out of scope for this round — would require Setup Intents, saved payment methods on customers, off-session charging, SCA handling, and a customer.subscription-style webhook. The Pay Now flow already covers "click to pay each invoice", which is the dominant SMB-trade pattern. Add later as `auto_charge` boolean on the schedule when a customer-payment-method table exists.
- **Proration / mid-cycle plan changes.** Maintenance contracts are flat or visit-based, not seat-based; proration is a SaaS pattern that adds complexity without a clear use case here.
- **Multi-currency.** The existing invoice system is single-currency; recurring inherits that. No regression.

