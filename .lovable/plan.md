

## SMS Notifications with Guided Twilio Onboarding

### What changes for the user

A new **Settings → Notifications → SMS** section that walks the tenant admin through Twilio setup as a 5-step checklist, then turns on customer-facing SMS for the events they choose. Once configured, the system can send:

- **Job reminders** (24 h before scheduled visits)
- **"On the way" alerts** (when a contractor clocks in)
- **Quote sent / accepted notifications** to customers
- **Invoice sent / overdue reminders** to customers
- **Custom one-off SMS** from the customer detail page (admin-triggered)

Customers get TCPA-compliant **STOP / HELP** keyword handling automatically. Opted-out numbers are blocked at the database level — no message can go out to a number on the suppression list.

The setup wizard does the hand-holding work: pre-fills A2P 10DLC campaign descriptions using the tenant's actual business name, deep-links to the right Twilio Console pages, validates pasted credentials in real time by hitting Twilio's API, polls campaign approval status, and provides a **Send test SMS** button before any customer receives anything.

### Definitive technical decision

**Use the Lovable Twilio connector (not raw API keys), persist a per-tenant `sms_settings` row pointing at the connection, build the wizard as a stateful checklist that calls Twilio's REST API through the connector gateway for live validation, gate every outbound send through a single `send-sms` edge function that enforces opt-out + rate limits, and run a daily `sms-job-reminders` cron worker for proactive notifications.**

Why this and not the alternatives:

1. **Connector over raw API key paste.** The Lovable Twilio connector gives us automatic OAuth-style credential storage, gateway-side rate limiting, credential rotation without code changes, and — critically — a `verify_credentials` endpoint that returns `verified | failed | skipped` without us hitting Twilio's billing endpoints. Raw API key paste would force us to encrypt + decrypt secrets in our own table, manage rotation manually, and risk leaking the Account SID through logs. The connector also means tenants who already use Twilio elsewhere in their workspace can reuse one connection across projects.

2. **One `send-sms` edge function, multiple callers.** Every SMS path (job reminder cron, on-the-way trigger, quote/invoice events, manual one-off) flows through one validated entry point. That entry point owns: opt-out check, rate limiting (`enhanced_rate_limit_check` per tenant, 200/hr default), tenant-scoped `from_number` resolution, message logging to `sms_messages`, and error normalization. Splitting per use case would duplicate compliance logic and guarantee one path eventually forgets the STOP-list check — which is a TCPA fine waiting to happen.

3. **Inbound webhook for STOP/HELP, even in v1.** US carriers *require* STOP/HELP/UNSUBSCRIBE keyword response. Twilio handles the auto-reply, but we still need to record the opt-out in our database so future sends are blocked. A `twilio-inbound` edge function with `verify_jwt = false` (Twilio signs requests, we verify the signature) is mandatory for compliance, not optional. Skipping this in v1 = shipping a feature that will get the tenant's number suspended within weeks.

4. **Daily cron at 9 AM tenant-local for reminders, not realtime polling.** Job reminders are inherently scheduled — a `pg_cron` job that runs hourly and dispatches reminders for jobs starting in 23–25 hours from each tenant's local "morning" is the canonical pattern (matches `extend-horizon`). Realtime triggers are reserved for *event-driven* SMS (clock-in, quote sent, invoice paid) which fire from existing flows.

5. **Suppression list as a dedicated table, not a flag on `customers`.** A phone number can belong to multiple customer records (spouse, business + personal, old + new entries). Opt-out is a property of the **phone number**, not the customer row. A `sms_opt_outs (tenant_id, phone_e164, opted_out_at, reason)` table with a unique index on `(tenant_id, phone_e164)` is the only correct model — and it's queried by the `send-sms` function before every send.

6. **E.164 normalization at write time, not send time.** Customer phones in this app are free-text. Storing the normalized E.164 form (`+15558675309`) in a generated column on `customers` lets us index it, dedupe against the opt-out list, and reject malformed numbers at form submission. Normalizing at send time means every reminder cron does the work redundantly and inconsistencies leak through.

7. **No fallback SMS provider in v1.** The plan-mode discussion floated Telnyx + Plivo adapters. Honest assessment: they add ~40% to the scope (a second wizard, a second STOP/HELP webhook, an adapter abstraction) for a hypothetical future where a tenant prefers Telnyx. Twilio is the dominant provider, the connector exists, and the abstraction can be added later without breaking the schema. Build the right thing once.

### Data model

```text
sms_settings                   one row per tenant
  id                  uuid pk
  tenant_id           uuid     unique, RLS by tenant
  twilio_connection_id text    null until wizard step 5 complete
  from_number_e164    text     null (selected Twilio number)
  messaging_service_sid text   null (preferred over from_number for A2P)
  campaign_status     text     'not_started' | 'pending' | 'approved' | 'rejected'
  campaign_status_checked_at timestamptz
  test_message_sent_at timestamptz
  enabled             boolean  default false
  notification_events jsonb    default '{
    "job_reminder_24h": true,
    "on_the_way": true,
    "quote_sent": false,
    "invoice_sent": false,
    "invoice_overdue": false
  }'
  daily_send_cap      integer  default 500
  created_at, updated_at

sms_opt_outs
  id                  uuid pk
  tenant_id           uuid
  phone_e164          text
  opted_out_at        timestamptz default now()
  reason              text     'stop_keyword' | 'help_request' | 'manual' | 'bounce'
  unique (tenant_id, phone_e164)

sms_messages                   audit log of every outbound + inbound
  id                  uuid pk
  tenant_id           uuid
  direction           text     'outbound' | 'inbound'
  to_number_e164      text
  from_number_e164    text
  body                text
  twilio_sid          text     null until provider responds
  status              text     'queued' | 'sent' | 'delivered' | 'failed' | 'received'
  error_code          text     null
  triggered_by        text     'job_reminder' | 'on_the_way' | 'quote_sent' | ...
  related_entity_type text     null  ('job_occurrence' | 'invoice' | 'quote')
  related_entity_id   uuid     null
  created_at          timestamptz default now()

customers
  + phone_e164        text     generated column, normalized from `phone`
                               (using a stable normalization function)
                               indexed for opt-out lookups
```

RLS: all three tables tenant-scoped, admin-only write, admin read. `sms_messages` also readable by the contractor whose triggered event produced the message (for the "on-the-way" case). Public-facing inbound webhook bypasses RLS via service role.

### Wizard flow (Settings → Notifications → SMS tab)

```text
Step 1  Connect Twilio          → calls standard_connectors--connect for twilio
                                  ✓ when sms_settings.twilio_connection_id set

Step 2  Buy a phone number       → deep-link to console.twilio.com/us1/develop/phone-numbers/manage/search
                                  → "I bought one" button → fetch /IncomingPhoneNumbers.json via gateway
                                  → dropdown to select; saves to from_number_e164
                                  ✓ when from_number_e164 set

Step 3  Register A2P 10DLC       → deep-link to messaging campaign setup
                                  → wizard pre-fills:
                                     • Brand: tenant business_name + EIN field
                                     • Campaign use case: "Customer Care"
                                     • Sample messages: generated from notification_events
                                       (e.g. "Reminder: We'll be at {address} tomorrow at 2pm. Reply STOP to opt out.")
                                     • Opt-in description: copy-paste-ready paragraph
                                  → "I submitted my campaign" → polls every 6h via gateway
                                  ✓ when campaign_status = 'approved'

Step 4  Send a test SMS          → admin enters their own number
                                  → send-sms function with triggered_by='test'
                                  → ✓ when test_message_sent_at populated

Step 5  Choose what to send      → toggle list mirroring notification_events
                                  → Save sets sms_settings.enabled = true
                                  ✓ ready
```

Each step has a green check, a "what does this mean?" expandable, and a copy-button for any pasteable text. Steps 1 and 4 happen entirely in-app; steps 2 and 3 require Twilio Console with our deep-link + pre-fill assistance.

### Edge functions

```text
supabase/functions/send-sms/index.ts
  POST { to: phone, body: text, triggered_by, related_entity_type?, related_entity_id? }
  - JWT auth, tenant resolved from caller
  - Validates: sms_settings.enabled, body length ≤ 1600, to is E.164
  - Checks sms_opt_outs for (tenant_id, normalized to)
  - enhanced_rate_limit_check(tenant_id, 'send-sms', 200, 60)
  - Counts today's sms_messages for daily_send_cap
  - Calls Twilio Messages API via connector gateway
  - Inserts sms_messages row with twilio_sid + status
  - Returns { ok, message_id, twilio_sid } or { error, code }

supabase/functions/twilio-inbound/index.ts          verify_jwt = false
  POST application/x-www-form-urlencoded from Twilio
  - Verifies X-Twilio-Signature against TWILIO_AUTH_TOKEN
    (read from connector secrets via service role)
  - Resolves tenant via from_number_e164 lookup
  - If body matches /^STOP$|UNSUBSCRIBE|END|QUIT|CANCEL/i:
      insert into sms_opt_outs, return TwiML auto-reply
  - If body matches /^HELP|INFO/i:
      return TwiML with tenant business_name + support contact
  - Otherwise: log to sms_messages with direction='inbound'
  - Returns TwiML XML

supabase/functions/sms-job-reminders/index.ts        cron: every hour
  - For each tenant where notification_events.job_reminder_24h:
      find job_occurrences where start_at between now()+23h and now()+25h
      AND tenant local time-of-day is between 8am and 8pm
      AND no prior reminder logged in sms_messages for that occurrence
      → call send-sms

supabase/functions/sms-twilio-validate/index.ts      wizard helper
  - Action 'list_numbers'   → GET /IncomingPhoneNumbers.json
  - Action 'campaign_status' → GET messaging service campaign
  - Action 'verify'          → POST /verify_credentials
  - All via gateway, returns sanitized response to wizard UI
```

Hooked into existing flows (no new edge functions needed):

- **On-the-way**: `time_entries` insert trigger (or client-side after `clockIn`) calls `send-sms` with `triggered_by='on_the_way'`.
- **Quote sent**: `useQuotes.sendQuote` already exists — add a parallel `send-sms` call when the customer has `phone_e164` and `notification_events.quote_sent`.
- **Invoice sent**: same pattern in `useInvoices.sendInvoice`.
- **Invoice overdue**: piggyback on the existing daily worker that flips overdue status; emit one SMS per newly-overdue invoice.

### UI surface

```text
src/components/Settings/SMSSettings.tsx              new — the wizard + post-setup config
src/components/Settings/SMS/
  TwilioConnectStep.tsx                              step 1
  PhoneNumberStep.tsx                                step 2
  CampaignRegistrationStep.tsx                       step 3 with pre-filled copy
  TestMessageStep.tsx                                step 4
  NotificationEventsStep.tsx                         step 5
  SMSStatusBadge.tsx                                 reused across steps
  SMSMessageLog.tsx                                  post-setup: recent message history
src/components/Settings/NotificationSettings.tsx     refactor: add "SMS" sub-tab
src/hooks/useSmsSettings.tsx                         CRUD on sms_settings
src/hooks/useSendSms.tsx                             wraps send-sms function
src/lib/phoneNormalization.ts                        E.164 helpers (libphonenumber-js)
src/components/Customers/CustomerSendSmsButton.tsx   one-off SMS from customer detail
```

### Edge cases handled

- **Number not yet opted in / first-time recipient.** The very first SMS to any customer includes a one-time opt-in line: `"You're receiving this from {business}. Reply STOP to opt out, HELP for help."` Tracked via `sms_messages.triggered_by='first_contact'` so it appears once per (tenant, phone).
- **Customer in multiple tenants' systems.** Opt-outs are tenant-scoped (`unique (tenant_id, phone_e164)`), which is the legally correct model — opting out of plumber A doesn't mute plumber B.
- **Phone number missing or unparseable.** `customers.phone_e164` generated column returns `NULL` on parse failure; `send-sms` returns `{ error: 'no_valid_phone' }` and skips silently for batch operations (so one bad number doesn't kill a 50-job reminder run).
- **Twilio campaign rejected.** Wizard surfaces the rejection reason from Twilio's API, offers a "fix and resubmit" path with re-pre-filled fields. `sms_settings.enabled` stays false until approved.
- **Campaign approved but tenant disconnects Twilio connection.** `send-sms` checks connection presence on every call; gracefully degrades by setting `enabled=false` and showing an in-app banner.
- **Daily cap exceeded.** `send-sms` returns `{ error: 'daily_cap_exceeded' }`. Cron skips remaining sends, logs to audit, banner appears in admin UI.
- **Twilio API outage.** `send-sms` catches 5xx, logs to `sms_messages` with `status='failed'`, returns clear error. Reminder cron retries on next hourly tick (safe because we check "no prior reminder" gate).
- **Contractor clock-in fires "on the way" outside business hours.** Hard-coded 7am–9pm tenant-local guard inside `send-sms` for non-admin-initiated messages. Admin one-off sends bypass this (admin chose to send).
- **Inbound STOP from a number we don't recognize.** Still recorded in `sms_opt_outs` with a fabricated tenant lookup via `from_number_e164` reverse lookup. Prevents future sends regardless of customer record state.
- **Twilio webhook signature missing/invalid.** Returns 403 immediately, logs to audit_logs as `'twilio_inbound_signature_failed'`. Critical to prevent spoofed STOPs from being injected.

### Files to create / change

```text
supabase/migrations/<ts>_sms_notifications.sql         new
supabase/functions/send-sms/index.ts                   new
supabase/functions/twilio-inbound/index.ts             new (verify_jwt = false in config.toml)
supabase/functions/sms-job-reminders/index.ts          new (pg_cron hourly)
supabase/functions/sms-twilio-validate/index.ts        new
supabase/config.toml                                   add verify_jwt=false for twilio-inbound

src/components/Settings/SMSSettings.tsx                new
src/components/Settings/SMS/*.tsx                      new (6 step + helper components)
src/components/Settings/NotificationSettings.tsx       add SMS sub-tab
src/components/Customers/CustomerSendSmsButton.tsx     new
src/hooks/useSmsSettings.tsx                           new
src/hooks/useSendSms.tsx                               new
src/lib/phoneNormalization.ts                          new

src/hooks/useQuotes.tsx                                add SMS dispatch on send
src/hooks/useInvoices.tsx                              add SMS dispatch on send
src/components/Jobs/JobView.tsx                        add "Notify customer I'm on the way" button
package.json                                           add libphonenumber-js
```

### Required user action

1. **Approve the Twilio connector connection** (one click in the wizard, step 1).
2. **Have an EIN and a business website ready** before starting step 3 (A2P 10DLC won't accept submissions without them).
3. **Set the inbound webhook URL** in their Twilio number settings — the wizard generates the exact URL (`https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/twilio-inbound`) with a copy button. This is a one-time paste.

No new project secrets are needed — the connector handles `TWILIO_API_KEY` automatically. `LOVABLE_API_KEY` is already configured.

### Explicitly NOT in v1 (and why)

- **Two-way conversation inbox.** Inbound non-keyword messages are logged to `sms_messages` but not surfaced as a chat UI. Would require realtime, threading, unread counts, notifications — a separate feature. The data is captured so the inbox can be built later without backfill.
- **MMS / image attachments.** Doubles per-message cost, requires storage URL signing for media, edge-cases TCPA differently. Add when a customer needs it.
- **Multi-provider abstraction (Telnyx / Plivo).** Discussed above — premature.
- **Customer-self-service opt-in via web form.** US carriers prefer this for compliance, but the existing client portal already serves as proof of relationship; we can add a checkbox on `ClientProfile.tsx` later.
- **Scheduled SMS campaigns / marketing blasts.** Different compliance regime (A2P 10DLC "Marketing" use case requires separate registration). Out of scope; this is transactional SMS only.

