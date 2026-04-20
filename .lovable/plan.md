

## Plan: Time Tracking + Job Photos/Attachments/Signatures

Two large features tackled as one cohesive "field operations" upgrade. Both share the same mobile-first surfaces (the contractor's job detail screen) and the same admin approval surfaces, so building them together avoids duplicate UI scaffolding.

---

## Feature A — Time Tracking & Timesheets

### Data model

**New table: `time_entries`**
- `id`, `tenant_id`, `created_at`, `updated_at`
- `user_id` (the contractor who clocked in)
- `job_occurrence_id` (nullable FK to `job_occurrences`) — the specific occurrence worked
- `job_series_id` (nullable FK to `job_series`) — set for one-time jobs (since they live in `job_series`)
- `clock_in_at` (timestamptz), `clock_out_at` (timestamptz, nullable while active)
- `duration_seconds` (generated column = `EXTRACT(EPOCH FROM (clock_out_at - clock_in_at))`)
- `clock_in_lat`, `clock_in_lng`, `clock_in_accuracy_m` (numeric, nullable)
- `clock_out_lat`, `clock_out_lng`, `clock_out_accuracy_m` (numeric, nullable)
- `notes` (text)
- `status` enum `time_entry_status`: `active` | `pending_approval` | `approved` | `rejected`
- `approved_by_user_id`, `approved_at`, `rejection_reason`
- `manual_entry` (boolean, default false) — true if admin created it after the fact

**RLS:**
- Contractors: SELECT/INSERT/UPDATE their own rows where `tenant_id = get_user_tenant_id()` AND `user_id = auth.uid()`. Cannot update once `approved`.
- Business admins: SELECT/INSERT/UPDATE/DELETE all rows in their tenant.

**Constraints:**
- Partial unique index: only one row per `user_id` where `clock_out_at IS NULL` (prevents double clock-in).
- Validation trigger: on UPDATE, reject if `clock_out_at < clock_in_at` or if status was `approved` and someone non-admin tries to mutate.

**Profile extension:**
- Add `default_hourly_rate` (numeric, nullable) to `profiles` — used for labor cost roll-up onto invoices.

### Edge functions
None required for v1 — all reads/writes are client-side via supabase-js with RLS protecting boundaries. (We can add a CSV export edge function if it gets too heavy in the browser; for v1, generate CSV client-side.)

### UI

**1. `<TimeClockWidget />`** — small floating panel shown in `Layout.tsx` for contractors only.
- Shows: "Clocked in to [Job Title] · 1h 23m" with red pulsing dot, OR "Not clocked in" with a "Clock In" button.
- When not clocked in: clicking "Clock In" opens a sheet listing today's assigned jobs → pick one → `navigator.geolocation.getCurrentPosition()` → insert `time_entries` row with `clock_in_at = now()` and lat/lng (graceful fallback if denied).
- When clocked in: "Clock Out" button → confirms → captures GPS again → updates row with `clock_out_at` + `status='pending_approval'`.

**2. New tab on `JobView.tsx`: "Time Entries"**
- Lists all time entries for that job with contractor name, in/out times, duration, GPS pin (small Google Maps static image link), status badge, approve/reject buttons (admin only).
- "+ Add manual entry" button (admin only) for retroactive entries.

**3. New page: `/timesheets` (admin only, added to nav)**
- Filters: date range, contractor, status, job.
- Table: contractor | job | clock in | clock out | duration | GPS | status | actions (approve/reject/edit).
- Bulk approve checkbox column.
- "Export CSV" button → generates `timesheets_YYYY-MM-DD.csv` with columns: contractor email, contractor name, job title, customer, clock in (ISO), clock out (ISO), duration hours, hourly rate, labor cost, status, approved by, approved at.
- "Export for Payroll" button → simpler CSV: contractor name, employee_id (use auth uid), pay period start, pay period end, total hours, total pay (using `default_hourly_rate`).

**4. Invoice integration**
- In `JobView.tsx` "Complete Job" flow: when admin marks job complete, if there are approved time entries with hourly rates set, offer to add a "Labor" line item to the auto-generated invoice (sum of hours × rate per contractor). Single line item: "Labor — X.XX hours @ $Y/hr".
- Goes through existing `useInvoices.createInvoice` flow.

---

## Feature B — Job Photos, Attachments & Signatures

### Storage buckets

Create three private buckets via migration:
- `job-photos` (private)
- `job-attachments` (private — for PDFs, docs attached to jobs/quotes/invoices)
- `signatures` (private)

**Path conventions** (enforced by RLS):
- `job-photos/{tenant_id}/{job_occurrence_id_or_series_id}/{before|after|during}/{uuid}.{ext}`
- `job-attachments/{tenant_id}/{entity_type}/{entity_id}/{uuid}.{ext}`
- `signatures/{tenant_id}/{job_occurrence_id_or_series_id}/{uuid}.png`

**RLS on `storage.objects`** for each bucket:
- SELECT: `(storage.foldername(name))[1]::uuid = get_user_tenant_id()` AND user has access (admin OR contractor assigned to that job — checked via subquery against `job_occurrences`/`job_series`).
- INSERT: same logic, plus `bucket_id` matches.
- DELETE: admin only, OR the uploader within 24h.

Public access is via short-lived signed URLs generated server-side, not via making the bucket public — protects PII in customer signatures and any sensitive docs.

### Data model

**New table: `job_files`** (the metadata index — storage holds the bytes, this row holds the searchable record)
- `id`, `tenant_id`, `created_at`, `created_by_user_id`
- `entity_type` enum: `job_occurrence` | `job_series` | `quote` | `invoice`
- `entity_id` (uuid)
- `file_kind` enum: `photo_before` | `photo_after` | `photo_during` | `attachment` | `signature`
- `bucket_id` (text), `storage_path` (text)
- `file_name`, `mime_type`, `size_bytes`
- `caption` (text, nullable)
- `signed_by_name` (nullable, only for signatures)
- `signed_at` (nullable)

**RLS:** SELECT/INSERT for tenant members; UPDATE/DELETE for admin or uploader.

### UI

**1. New tab on `JobView.tsx`: "Photos & Files"**
- Two sections: "Before Photos" / "After Photos" with grid of thumbnails + "Upload" button (camera capture on mobile via `<input type="file" accept="image/*" capture="environment">`).
- "Other Attachments" section below (any file type up to 10MB).
- Each thumbnail has caption, uploader name, timestamp. Click → lightbox preview. Admin/uploader can delete.
- All uploads go to `job-photos` bucket → row inserted into `job_files`.

**2. `<SignatureCapture />`** — used on the "Complete Job" flow
- When contractor (or admin on behalf of customer) marks a job complete:
  - If `system_settings.require_job_photos` is true, block completion until at least one "After" photo is uploaded.
  - New step: "Customer Signature" — full-screen canvas (use `react-signature-canvas`), text field for "Customer name", "Skip" button.
  - On confirm: canvas → PNG blob → upload to `signatures` bucket → insert `job_files` row with `file_kind='signature'`, `signed_by_name`, `signed_at`.

**3. Quote/Invoice attachments**
- Add small "Attachments" section to `QuoteForm.tsx` and `InvoiceForm.tsx` (collapsible, default closed). Same upload pattern → `job-attachments` bucket → `job_files` row with appropriate `entity_type`.
- Show attachment list on `QuotePreview.tsx` and `InvoicePreview.tsx` (and on the public token pages, with signed URLs generated server-side).

**4. Public invoice/quote page enhancement**
- New edge function `get-public-file-url` (no JWT) — takes share_token + file_id, validates the token belongs to the file's parent entity, returns a 1-hour signed URL. Prevents leaking internal storage paths.

### Edge functions
- **`get-public-file-url`** (no JWT) — used by `PublicInvoice.tsx`/`PublicQuote.tsx` to fetch signed URLs for attachments shown to the customer.
- (Optional, deferred) **`compress-photo`** — auto-resize uploaded photos to max 1920px before storing. For v1, do this client-side with a Canvas resize before upload.

---

## Build order

1. **Migration 1** — `time_entries` table + enum + RLS + unique active-entry index + validation trigger; `profiles.default_hourly_rate` column.
2. **Migration 2** — `job_files` table + enums + RLS; create three storage buckets + storage RLS policies.
3. **Hook**: `useTimeEntries` (live current entry, history, create/clock-out/approve/reject).
4. **`<TimeClockWidget />`** in `Layout.tsx` (contractor-only).
5. **JobView "Time Entries" tab**.
6. **`/timesheets` page** + admin nav link + CSV export.
7. **Hook**: `useJobFiles` (list/upload/delete, with client-side image resize).
8. **JobView "Photos & Files" tab**.
9. **`<SignatureCapture />` integrated into job completion flow** (respects `require_job_photos` setting).
10. **Attachments on quote/invoice forms + previews**.
11. **`get-public-file-url` edge function + wire into PublicInvoice/PublicQuote**.
12. **Labor cost auto-injection** when invoice is created from a completed job with approved time entries.
13. **End-to-end test pass**: contractor clocks in → adds photos → clocks out → admin approves → invoice auto-includes labor cost → customer signs on completion → public invoice shows attachments.

---

## Things explicitly NOT in scope this round

- Geofencing / auto-clock-out when leaving job site (needs background location, deferred).
- OCR or auto-tagging of photos.
- Real-time multi-contractor presence on a job.
- DocuSign-style multi-party signatures.
- QuickBooks/Gusto/ADP direct payroll integration (CSV export is the hook for now).

