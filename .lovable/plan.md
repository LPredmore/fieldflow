

## Plan: Multi-Provider Payments with Stripe Connect

### End goal
Each tenant (business owner) chooses any combination of payment methods to expose on the public invoice page. Manual methods (PayPal.me, Venmo, Cash App, Cash, Check, Bank Transfer) display instructions and let the admin mark paid manually. Stripe is connected per-tenant via **Stripe Connect Standard OAuth** so card/ACH payments deposit directly into the tenant's own Stripe account, and invoices auto-mark as paid via webhook.

---

### Why Stripe Connect Standard (definitive decision)

Three Connect flavors exist: Standard, Express, Custom.

- **Standard** — tenant uses their own full Stripe account, manages their own dashboard, handles their own disputes/payouts/1099s. We just route payments to them via OAuth. Lowest legal/compliance burden on FieldFlow.
- **Express** — Stripe-hosted lite dashboard, FieldFlow takes on more responsibility for onboarding/support, requires us to handle 1099s.
- **Custom** — fully white-labeled, FieldFlow becomes responsible for all KYC, disputes, payouts, tax forms.

**Decision: Standard.** Reasons:
1. Tenants are independent SMBs (contractors, lawn care, etc.) — they want their own Stripe account they can log into directly.
2. Zero KYC/onboarding UI for us to build — Stripe hosts it.
3. No 1099-K obligations on FieldFlow.
4. OAuth flow is the simplest "Connect your Stripe" UX possible — one button, redirect, done.
5. Application fees still work if we ever want to take a platform cut later.

---

### Architecture

```text
                ┌─────────────────────┐
                │  Public Invoice     │
                │  /invoice/:token    │
                └──────────┬──────────┘
                           │ shows enabled methods
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                     │
   Manual methods                       Stripe (if connected)
   (PayPal/Venmo/                       │
    CashApp/Cash/                       ▼
    Check/Bank)                  create-payment-intent
        │                       (edge fn, uses tenant's
        │                        stripe_account_id)
        │                              │
        ▼                              ▼
   Customer pays                Stripe Checkout
   off-platform                       │
        │                              ▼
        │                       stripe-webhook
        │                       (verifies + marks
        │                        invoice paid)
        ▼
   Admin clicks
   "Mark as Paid"
   (already exists)
```

---

### Data model changes

**New table: `stripe_connected_accounts`** (one row per tenant that connects Stripe)
- `tenant_id` (PK, FK-ish to tenants)
- `stripe_account_id` (e.g. `acct_xxx`)
- `account_email`, `display_name`, `charges_enabled`, `payouts_enabled`
- `connected_at`, `disconnected_at` (nullable)
- RLS: only that tenant's `business_admin` can read/write

**Extend `settings.payment_settings` (jsonb)** — no schema change needed, just add structured shape:
```json
{
  "enabled_methods": ["stripe", "paypal", "venmo", "cashapp", "cash", "check", "bank_transfer"],
  "paypal_me_link": "...",
  "venmo_handle": "...",
  "cashapp_handle": "...",
  "bank_transfer_instructions": "...",
  "check_payable_to": "...",
  "payment_instructions": "..."
}
```

**Extend `invoices` table:**
- `stripe_payment_intent_id` (text, nullable)
- `stripe_checkout_session_id` (text, nullable)
- `payment_method_used` (text, nullable — "stripe_card", "stripe_ach", "paypal", "venmo", "cashapp", "cash", "check", "bank_transfer", "other")

**Update `get_public_invoice_by_token` RPC** to also return the tenant's enabled payment methods + handles + a flag for whether Stripe is connected — so the public page renders the right buttons without leaking the tenant's `stripe_account_id`.

---

### Edge functions (new)

1. **`stripe-connect-oauth-start`** — generates Stripe OAuth URL with `state` param tied to tenant_id, returns it. Admin clicks "Connect Stripe" → redirected to Stripe.
2. **`stripe-connect-oauth-callback`** — receives `code` + `state`, exchanges for `stripe_user_id`, stores in `stripe_connected_accounts`, redirects back to Settings.
3. **`stripe-connect-disconnect`** — calls Stripe OAuth deauthorize, soft-deletes the row.
4. **`create-invoice-checkout`** — public-callable (no JWT). Takes `share_token`, looks up invoice + tenant's `stripe_account_id`, creates Stripe Checkout Session with `stripe_account` set on the request (Direct Charge to connected account). Returns checkout URL.
5. **`stripe-webhook`** — receives `checkout.session.completed` / `payment_intent.succeeded`. Verifies signature. Looks up invoice by metadata, marks `status='paid'`, sets `paid_date`, `payment_method_used`, `stripe_payment_intent_id`.

### Secrets needed
- `STRIPE_SECRET_KEY` (FieldFlow's platform key)
- `STRIPE_CONNECT_CLIENT_ID` (from Stripe Connect settings)
- `STRIPE_WEBHOOK_SECRET` (for webhook verification)

User must add these in Lovable Cloud secrets before edge functions can run. Stripe Connect requires the user to enable Connect in their Stripe dashboard and grab the Client ID (`ca_xxx`).

---

### UI changes

**`src/components/Settings/FinancialSettings.tsx`** (or new `PaymentMethodsSettings.tsx`)
- Section: "Payment Methods Customers Can Use"
- Checkbox list: Stripe (Card/ACH), PayPal.me, Venmo, Cash App, Cash, Check, Bank Transfer
- For each checked manual method, show its config field (handle, instructions, payable-to name)
- For Stripe: show "Connect Stripe Account" button if not connected; show account email + "Disconnect" if connected. Show warning badge if `charges_enabled = false`.

**`src/pages/PublicInvoice.tsx`**
- Replace hardcoded PayPal/Venmo block with a dynamic list driven by `enabled_methods`
- Stripe → primary "Pay $X with Card or Bank" button → calls `create-invoice-checkout` → redirects to Stripe Checkout
- Manual methods → render appropriate button/instructions block (Cash App `$cashtag`, Venmo `@handle`, PayPal.me link, bank instructions, etc.)
- After Stripe checkout success redirect, show "Payment received" state (poll invoice status briefly, since webhook may take 1-2s)

**`src/components/Invoices/InvoiceCard.tsx` / invoice list**
- Add small badge showing `payment_method_used` once paid

---

### Security & correctness

- Webhook **must** verify Stripe signature using `STRIPE_WEBHOOK_SECRET` — never trust the body.
- `create-invoice-checkout` is public (no JWT) but rate-limited via existing `enhanced_rate_limit_check` keyed on share token + IP.
- Stripe Checkout Session is created with `stripe_account` header (Direct Charge), so funds settle directly in the tenant's account — money never touches a FieldFlow account. This is the legally correct posture and the reason Connect Standard exists.
- The public RPC must NOT return `stripe_account_id`. Public page just gets a boolean `stripe_enabled`; the edge function looks up the account_id server-side.
- OAuth `state` param must be a signed/HMAC token containing tenant_id + nonce, validated on callback to prevent CSRF.

---

### Build order

1. Migration: `stripe_connected_accounts` table + RLS, extend `invoices` columns, update `get_public_invoice_by_token` RPC.
2. Add 3 Stripe secrets via Lovable Cloud secrets prompt.
3. Edge functions: oauth-start, oauth-callback, disconnect, create-invoice-checkout, stripe-webhook.
4. Settings UI: payment methods multi-select + Stripe Connect button.
5. PublicInvoice page: dynamic payment method rendering + Stripe Checkout flow.
6. Polish: paid-state polling, payment method badge on invoice cards.

---

### Out of scope for this round (acknowledged but deferred)

- **Saved cards / card-on-file** — requires Stripe Customers per end-customer; add after base flow works.
- **Refunds UI** — admin-side refund button calling Stripe Refunds API; add as a follow-up.
- **Application fees / FieldFlow platform cut** — Connect supports it, but you haven't asked for it; leaving off.
- **Subscription/recurring auto-charge** — separate feature tied to recurring invoices (Phase 2 of the larger roadmap).

