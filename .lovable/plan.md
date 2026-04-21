

## Fix the hardcoded sender — use the tenant's verified Resend domain

### The actual bug

Three edge functions hardcode `from: "<business name> <onboarding@resend.dev>"`:

- `supabase/functions/send-quote-email/index.ts` (line 166)
- `supabase/functions/send-invoice-email/index.ts` (line 275)
- `supabase/functions/send-notification-email/index.ts` (line 81) — used by every notification worker (on-the-way, crew reminders, quote follow-up, invoice overdue)

That means **every** email currently sent by the app goes out as `onboarding@resend.dev` regardless of who the tenant is. For your tenant (with `flo-pro.org` already verified in your Resend account), this is wrong — they should go from `info@flo-pro.org`.

### What "default" means in a multi-tenant app

Important honesty point: this app is multi-tenant. There will eventually be other tenants who do **not** own `flo-pro.org`. So the fix can't just hardcode `info@flo-pro.org` everywhere — that would send other tenants' emails from your domain, which is both wrong and (depending on Resend's domain auth) would likely fail to send at all.

The correct model is **per-tenant sender configuration** with a sensible fallback. Each tenant configures their own verified Resend sender; if they haven't configured one yet, we fall back to `onboarding@resend.dev` (which is the only "send from anywhere" address Resend allows without verification).

For your specific tenant, configuring `info@flo-pro.org` once means every email — quotes, invoices, on-the-way alerts, crew reminders, follow-ups, overdue nudges — goes from your verified domain.

### Definitive technical decision

**Add two columns to `settings` (`email_from_address`, `email_from_name`), build one shared `resolveEmailSender(tenantId)` helper, and replace every hardcoded `onboarding@resend.dev` with a call to that helper. Surface the configuration in Settings → Business as a single "Sender email" field with a verification status indicator.**

Why this and not the alternatives:

1. **Per-tenant column, not env var.** An env var would force one sender for the whole platform — wrong for multi-tenancy, and would silently break the moment a second tenant signs up. Two columns on `settings` is the smallest correct change.

2. **Two columns, not one.** `email_from_address` (e.g., `info@flo-pro.org`) and `email_from_name` (e.g., `Flo-Pro` — defaults to `business_name`). Splitting them lets the display name evolve independently of the address and matches Resend's API shape (`"Display Name <email@domain.com>"`).

3. **One shared helper, not three copy-pasted resolutions.** A `_shared/email-sender.ts` module loaded by all three functions guarantees the fallback logic is identical everywhere. Today's bug exists *because* the resolution is duplicated and one branch (`send-notification-email`) was written with a TODO comment that was never followed up on.

4. **Don't try to verify the domain through our app.** Resend domain verification is DNS-based (SPF/DKIM/DMARC TXT records). The user already did this in their Resend dashboard for `flo-pro.org`. Building DNS verification into our app would duplicate Resend's UI badly. Instead, we surface a "Send test email" button — if Resend accepts the send, the domain is verified; if it rejects with `domain_not_verified`, we show the exact Resend error and link to their dashboard.

5. **Fall back to `onboarding@resend.dev`, not fail.** New tenants who haven't configured their domain still need quote/invoice emails to work from day one. The fallback ensures that. A small in-app banner ("You're sending from the default Resend address — configure your domain to brand your emails") nudges them to set it up without breaking the feature.

6. **Honest scope note: this is not "Lovable Email domain" setup.** Your Resend account is your own — Lovable's built-in email domain feature would *replace* Resend entirely (different DNS records, different sender infrastructure). You explicitly already have `flo-pro.org` working in Resend. The right move is to *use* what you've already set up, not migrate you off it.

### Data model change

```text
settings
  + email_from_address    text     null   e.g., "info@flo-pro.org"
  + email_from_name       text     null   e.g., "Flo-Pro" (display name; defaults to business_name)
```

Backfill: leave both `null` for existing rows — the resolver treats `null` as "use the platform default". Manually set your tenant's row to `info@flo-pro.org` / `Flo-Pro` as part of the migration so it works immediately for you without UI configuration.

No RLS changes needed — `settings` is already tenant-scoped and admin-managed.

### Shared resolver

```text
supabase/functions/_shared/email-sender.ts          new

  export async function resolveEmailSender(admin, tenantId): Promise<{
    from: string                    // formatted "Name <email>" string for Resend
    fromAddress: string             // bare email for logging
    isCustomDomain: boolean         // true if tenant configured, false if fallback
  }>

  Logic:
    1. Load settings.email_from_address, email_from_name, business_name for tenantId
    2. If email_from_address is set:
         name = email_from_name || business_name || "Notifications"
         return { from: `${name} <${email_from_address}>`, fromAddress: email_from_address, isCustomDomain: true }
    3. Else (fallback):
         name = business_name || "Notifications"
         return { from: `${name} <onboarding@resend.dev>`, fromAddress: "onboarding@resend.dev", isCustomDomain: false }
```

### Edge function changes

```text
supabase/functions/send-notification-email/index.ts
  - Replace inline `fromEmail` construction (line 81) with resolveEmailSender(admin, tenantId)
  - Use the returned `from` in the Resend POST body
  - Log `fromAddress` in email_messages.from_email (today it logs the formatted string, which is fine but isCustomDomain should also be captured for analytics)

supabase/functions/send-quote-email/index.ts
  - Replace line 166 hardcoded `from` with resolveEmailSender(supabase, existingQuote.tenant_id)
  - Note: this function currently uses `.single()` on settings without a tenant filter (line 156–158). That's a pre-existing bug — it returns whichever row Postgres feels like. Fix as part of this work: filter by tenant_id from the quote row.

supabase/functions/send-invoice-email/index.ts
  - Replace line 275 hardcoded `from` with resolveEmailSender(supabase, invoice.tenant_id)
  - Already filters settings by tenant correctly (line 165) — just swap the from string.
```

All three functions need redeployment after the change.

### UI surface

```text
src/components/Settings/BusinessSettings.tsx           add fields
  Section: "Email sender"
    [Email from address]   info@flo-pro.org              (text input, type=email)
    [Display name]         Flo-Pro                       (text input, defaults to business name)
    [Send test email]      → calls send-notification-email with triggered_by='sender_test'
                             returns { ok, isCustomDomain, error? } — show success or Resend's exact error

  Helper text below the field:
    "Emails to your customers will be sent from this address. The address must
     be verified in your Resend dashboard before it will work. If left blank,
     emails go from the default Resend sender."

  Status badge next to the field:
    - Green "Verified" if the most recent test_message_sent_at succeeded
    - Amber "Not yet tested" if email_from_address is set but no successful test
    - Gray "Using default sender" if email_from_address is null
```

Hooked through existing `useSettings` — just add the two fields to the form schema and the update payload.

### Migration

```text
supabase/migrations/<ts>_email_sender_per_tenant.sql

  ALTER TABLE public.settings
    ADD COLUMN email_from_address text,
    ADD COLUMN email_from_name text;

  -- Seed the current tenant (your account) so it works immediately
  UPDATE public.settings
  SET email_from_address = 'info@flo-pro.org',
      email_from_name    = COALESCE(business_name, 'Flo-Pro')
  WHERE tenant_id = '<your-tenant-id>';   -- resolved at migration time
```

The `WHERE` clause in the seed will need your tenant_id. We can either look it up at migration time (one query against `profiles` joined to `settings`) or do it as a follow-up `UPDATE` after you confirm which tenant row is yours.

### Edge cases handled

- **Tenant sets an unverified domain.** First send fails with Resend `domain_not_verified` error. We log it to `email_messages` with `error_code='domain_not_verified'` and surface the exact error in the test-email button response. UI shows: "Resend rejected this address — verify it in your Resend dashboard."
- **Tenant clears the field after using it.** Resolver falls back to `onboarding@resend.dev` automatically. No code path breaks.
- **`reply_to` already uses `business_email`.** That stays as-is — `from` and `reply_to` are independent. Replies still go to your support inbox even if `from` is a no-reply alias.
- **Resend API key shared across tenants.** Currently `RESEND_API_KEY` is one platform-level secret. As long as every tenant's `email_from_address` domain is verified in *that* Resend account, sends succeed. If a future tenant wants their own Resend account, that's a separate (much larger) feature — not in scope here.
- **`send-quote-email` settings query bug.** Pre-existing `.single()` without tenant filter — fixed as a side-effect of this change because we now filter by the quote's tenant_id.
- **Email logging.** `email_messages.from_email` continues to record what was actually sent, so the audit log accurately reflects whether each message went out as your domain or the fallback.

### Files to create / change

```text
supabase/migrations/<ts>_email_sender_per_tenant.sql            new
supabase/functions/_shared/email-sender.ts                      new
supabase/functions/send-notification-email/index.ts             use resolver
supabase/functions/send-quote-email/index.ts                    use resolver + fix tenant filter
supabase/functions/send-invoice-email/index.ts                  use resolver
src/components/Settings/BusinessSettings.tsx                    add 2 fields + test button + status badge
src/hooks/useSettings.tsx                                       extend schema with the 2 new fields
```

### Required user action

1. **Confirm `flo-pro.org` is fully verified in your Resend dashboard** (SPF, DKIM, DMARC all green). If it is, no further DNS work is needed.
2. **Confirm `info@flo-pro.org` is the address you want as the default**, or specify a different one (e.g., `notifications@flo-pro.org`, `quotes@flo-pro.org`).
3. After deploy: click "Send test email" in Business Settings to confirm a real send succeeds.

### Honest tradeoff

This fix uses your *existing* Resend account and your *existing* verified domain. It does **not** replace Resend with Lovable's built-in email infrastructure. That alternative path would also work — and is arguably simpler long-term — but would require: (a) removing your current Resend integration, (b) setting up a Lovable email domain (NS delegation), (c) waiting for DNS propagation, (d) rewriting all three email functions to use the Lovable email API instead of Resend. That's a much bigger change than what you asked for. If you'd rather go that route, say so and I'll write a separate plan. Otherwise, this plan keeps Resend and just makes the sender configurable per tenant — which is what the bug actually requires.

