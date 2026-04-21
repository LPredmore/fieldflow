

## End-to-End Review — Bugs Found After the SMS/Notifications Overhaul

Below is the honest, prioritized list of issues I found by reading every new edge function, every cron-scheduled worker, the migrations, the UI hooks, and querying the live database. I'm separating **bugs that will silently break notifications** from **smaller correctness/UX issues**.

I have not changed any code yet — this is the diagnosis. Approve the plan and I'll fix everything in priority order in default mode.

### CRITICAL — these will silently break notifications in production

**1. Workers invoke `send-sms` with the anon key as if it were a user JWT — every cron-driven SMS will return 401.**
`send-sms/index.ts` validates the bearer token via `supabase.auth.getClaims(token)` and requires `claims.sub` (a user id). The five workers (`notify-on-the-way`, `sms-crew-reminders`, `quote-followup-worker`, `invoice-overdue-worker`, plus the in-app `JobView` button works because it uses a real user JWT) call `send-sms` with `Authorization: Bearer ${SUPABASE_ANON_KEY}` — that token has no `sub` claim, so `getClaims` returns nothing and `send-sms` returns 401. Result: **every automated SMS we promised in the last overhaul will fail.** The fix is to add a service-role bypass in `send-sms` (e.g., accept an `internal: true` flag from the workers using the service role key, OR have the workers POST directly to the Twilio gateway like `sms-job-reminders` already does).

**2. The `email_from_address` seed in the latest migration matched zero tenants.**
The migration targets rows where `business_email ILIKE '%@flo-pro.org'` OR `business_website ILIKE '%flo-pro.org%'`. Live DB shows the three existing tenants are `info@valorwell.org`, `info@test.com`, and `null`. None has `flo-pro.org`. Result: **every email — quotes, invoices, on-the-way, follow-ups, overdue — still goes from `onboarding@resend.dev`**, which is exactly what we set out to fix in the last loop. The fix is a small migration that updates the *correct* tenant (yours — `Lucas Predmore`'s `predmoreluke@gmail.com` admin row, tenant `7b369be5-679b-4750-8e33-6c95cb1f257c`) and leaves the rest alone.

**3. `sms_settings` table is empty for every tenant.**
No row exists. That means: (a) the SMS wizard hasn't been initialized for anyone, (b) `sms-job-reminders` cron's `eq("enabled", true)` selects zero rows every hour and silently exits, (c) the workers' `notification_events` reads return `null`, and the workers continue without warning. Not a code bug per se, but the user needs a clear UX path. Fix: have `useSmsSettings.ensureExists()` actually run on first visit to Settings → Notifications → SMS (it does, but only if the user opens that tab) — and add a "Notifications need configuration" banner on the dashboard for admins so it's discoverable.

**4. `notify-on-the-way` is invoked by a DB trigger that fires on EVERY `time_entries` insert, including manual entries and admin-created back-dated entries.**
The trigger condition is `NEW.status = 'active' AND NEW.job_occurrence_id IS NOT NULL`. That fires for any insert with status active — including manual time entry corrections that admins make after a job is over. A customer who had a job last Tuesday could get an "on the way" SMS today if an admin enters their time. The fix: also check `NEW.manual_entry IS NOT TRUE` AND `NEW.clock_in_at > now() - interval '15 minutes'` so back-dated entries don't trigger.

**5. `invoice-overdue-worker` mass-flips invoices to `overdue` without tenant filtering or logging.**
Line 29 runs `UPDATE invoices SET status='overdue' WHERE due_date < today AND status='sent'` across **all tenants in one query**. That's not wrong technically (it respects the data), but it bypasses the `invoices_status_change` audit log path that the UI uses, and there's no notification or per-tenant reporting. Add tenant_id grouping, log the count per tenant, and skip tenants whose `notification_settings.invoice_overdue_email === false` AND whose SMS toggle is off (currently we flip even if they don't want notifications).

**6. `quote-followup-worker` window is ±24h on UTC `sent_date`.**
Lines 27–32 compute `target = today - days days` and check `sent_date BETWEEN dayStart AND dayEnd` in **UTC**. A quote sent at 10pm Eastern lands on the next UTC day, so day 3 fires on what is locally day 2 or day 4. Switch to `sent_date::date = (now() at time zone tenant_tz - days * interval '1 day')::date` and add a small ±2h slop window. Same kind of issue exists in `sms-crew-reminders` for the 6pm hour boundary (currently uses `hour === 18` which is correct, but no check that the cron actually ran during that hour — fine as-is, just noting).

### HIGH — wrong but not silently broken

**7. Idempotency only checks for ANY prior dispatch (any channel), not per-channel.**
`notify-on-the-way` queries `notification_dispatches` by `event_key` only (no channel filter). If the SMS sent successfully but email failed, a retry can't send the email because the lookup sees the SMS row and skips both. Fix: filter by `(event_key, channel)` separately, OR record both channel attempts then check per-channel before dispatching that channel.

**8. `email_messages` log is never written for failures inside `send-quote-email` or `send-invoice-email`.**
Only `send-notification-email` writes to the audit table. The other two just throw. So the admin's email log shows automated notifications but no quote/invoice emails — confusing for the user trying to debug "did my quote actually go out?" Fix: extract the logging into the shared `_shared/email-sender.ts` helper or add an explicit `logEmailMessage` helper called from all three functions.

**9. `dispatchQuoteSms` and `dispatchInvoiceSms` (in `useQuotes`/`useInvoices`) bypass idempotency.**
They fire SMS directly via `send-sms` from the browser, with no `notification_dispatches` row. If a user clicks "Send" twice in 2 seconds (or a network retry triggers), two SMS go out. Fix: route through a small server-side `dispatch-quote-sent` / `dispatch-invoice-sent` that writes the idempotency row.

**10. `verify_jwt = false` on `send-notification-email` is a footgun.**
Anyone on the internet who knows the URL can POST a notification email through your tenant. Today the function trusts `body.tenant_id` if provided — they could set any tenant_id and email any address. Server-to-server calls do need `verify_jwt = false`, but we should require an `X-Internal-Secret` header (stored in vault) for any call that supplies an explicit `tenant_id`. The user-initiated path that derives `tenantId` from auth is fine.

**11. `BusinessSettings.handleSendTestEmail` says "data?.ok" but throws if `data` is `undefined`.**
Line 174: `if (error || !data?.ok)`. When the function returns 502 with `{ ok: false, error: '...' }`, supabase-js puts the body on `data`, but on network failures `data` is `undefined`. The existing handler is fine for that case actually — but it shows `data?.error_code || error?.message` which on success-with-non-ok-body shows nothing useful. Cosmetic — surface the full server-side error message in the toast.

**12. `useSmsSettings` queries `sms_settings` without filtering by tenant.**
Line 60: `.from("sms_settings").select("*").maybeSingle()`. Works because of RLS, but `maybeSingle()` will error if multiple rows match (impossible today because of UNIQUE on tenant_id, but fragile). Add `.eq('tenant_id', tenantId)`.

### MEDIUM — UX and correctness improvements

**13. `CustomerSendSmsButton` doesn't show the standard opt-out confirmation.**
It passes `bypass_business_hours: true` for manual sends, which is right, but the dialog doesn't warn the user that the first message to a brand-new recipient gets the auto-appended TCPA disclosure. Add a small inline note: "First message to this number will include a one-time opt-out disclosure."

**14. No unified notification settings page — toggles live in two places.**
`Settings → Notifications → Email` controls per-event email toggles (`*_email` keys in `notification_settings`). `Settings → Notifications → SMS → Step 5` controls SMS toggles. Same events, two screens, no shared UI. Combine them into one matrix as planned (Email column + SMS column per event row) so users don't have to flip back and forth and miss a checkbox.

**15. Cron jobs use embedded plaintext anon key in one place, vault in another.**
`20260421144216` (`sms-job-reminders-hourly`) embeds the anon key directly in the SQL string. The newer `20260421193840` jobs use the vault. Inconsistent and harder to rotate. Move all three crons to vault lookup.

**16. `email_messages.status` only ever becomes `sent` or `failed`.**
Never `bounced` or `delivered`, because we don't subscribe to Resend webhooks. If a customer emails bounce, we keep "successfully sent" the audit log, which is misleading. Either add a Resend webhook handler later, or relabel `sent` to `accepted_by_resend` to be honest about what we actually know.

**17. `time_entries` RLS allows any contractor in the tenant to insert their own time entry — but the trigger fires `notify-on-the-way` from the contractor's session.**
Service-role HTTP call from inside a `SECURITY DEFINER` trigger is fine, but if a contractor maliciously inserts a fake `time_entries` row pointing at any `job_occurrence_id` in the tenant, the customer gets a spam SMS. Add a check inside the trigger function: only fire if `NEW.user_id = (SELECT assigned_to_user_id FROM job_occurrences WHERE id = NEW.job_occurrence_id)`.

**18. `quote-followup-worker` and `invoice-overdue-worker` send links to `https://fieldflow.flo-pro.org` hardcoded.**
That's your custom domain. Other tenants signing up on `*.lovable.app` will get broken links. Read the public site URL from settings (or env) instead of hardcoding.

**19. `BusinessSettings` "Send test email" still lets the user click before saving — the new sender values are saved as a side effect inside `handleSendTestEmail`.**
That works but is non-obvious; when the test fails the user might re-edit, click again, and have stale values committed. Add an explicit "Save & test" button that runs `updateSettings` first, awaits success, then triggers the test.

### LOW — cleanups

**20. `supabase/functions/_shared/email-sender.ts` types `admin` as `any`.** Tighten to `SupabaseClient<Database>`.

**21. The `ignore` table** in the schema appears unused and has no RLS. Drop it or document why it exists.

**22. `sms_settings.notification_events` default in the table doesn't match the TypeScript `DEFAULT_NOTIFICATION_EVENTS` perfectly** (DB has `invoice_overdue: true`, code has the same — actually matches; verified). Keep as-is.

**23. Unused `phone_e164` lookup vs raw `phone` in `CustomerSendSmsButton`.**
The button passes `customer.phone` (free-text) instead of `customer.phone_e164` (the generated normalized column). Edge function normalizes again, so it works — but it's a redundant call and inconsistent with how `JobView.handleNotifyOnTheWay` does it (which uses `phone_e164`). Standardize on `phone_e164`.

### Plan to fix (proposed order, batched)

```text
Batch 1 — Stop the silent failures
  □ Add service-role bypass to send-sms; refactor 4 workers to use it
  □ Re-seed email_from_address for the correct tenant (Lucas Predmore / predmoreluke@gmail.com)
  □ Tighten on_the_way DB trigger (recent + assigned-only)
  □ Per-channel idempotency in notify-on-the-way

Batch 2 — Honest audit logging + correctness
  □ Centralize email logging across all three send-*-email functions
  □ Server-side dispatch helpers for quote_sent / invoice_sent
  □ X-Internal-Secret guard on send-notification-email when tenant_id is provided
  □ Tenant-aware overdue flip + per-tenant skip if all channels off
  □ Tenant-local quote-followup day math

Batch 3 — UX consolidation
  □ Unified Email × SMS notification matrix (one screen, one save)
  □ "Save & test" pattern in BusinessSettings sender section
  □ Dashboard banner for admins when sms_settings/email sender unconfigured
  □ Standardize on customer.phone_e164 in send buttons

Batch 4 — Cleanups
  □ Move sms-job-reminders cron to vault key
  □ Replace hardcoded fieldflow.flo-pro.org URL with settings-driven base
  □ Tighten _shared/email-sender.ts types
  □ Drop unused `ignore` table (confirm with you first)
```

### Required user input before I start

Three quick decisions:

1. **Confirm your tenant id.** Live DB shows `Lucas Predmore` (`predmoreluke@gmail.com`) at tenant `7b369be5-679b-4750-8e33-6c95cb1f257c` — is this the one that should send from `info@flo-pro.org`? Or is it the second `Lucas Predmore` row (`info@valorwell.org`, tenant `4ae1872d-…`)?
2. **Public link base URL.** Should `fieldflow.flo-pro.org` stay as the default for all tenants, or should each tenant be able to override it (and we fall back to `fieldflow-customer-connect.lovable.app` for tenants without a custom domain)?
3. **Drop `ignore` table?** It has no RLS and no apparent usage. Safe to remove?

Answer those three and I'll execute Batches 1–4 in order.

