

## Plan: Fix build error, then continue Stripe Connect implementation

### Step 1 — Fix TypeScript build error (1 line)

**File:** `src/hooks/useCalendarJobs.tsx` line 62

The `NodeJS.Timeout` namespace doesn't exist in browser TypeScript builds. Replace with the universal `ReturnType<typeof setTimeout>` which works in both browser and Node environments.

```ts
// Before
const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// After
const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

### Step 2 — Request Stripe secrets

Prompt to add three runtime secrets (database table + RPC are already in place from prior step):
- `STRIPE_SECRET_KEY` — your platform Stripe secret key (`sk_live_...` or `sk_test_...`)
- `STRIPE_CONNECT_CLIENT_ID` — from Stripe Dashboard → Settings → Connect → "Connect" tab (`ca_...`)
- `STRIPE_WEBHOOK_SECRET` — generated when you register the webhook endpoint (`whsec_...`); we'll come back and set this AFTER deploying the webhook function so you have the URL to register

Order: ask for `STRIPE_SECRET_KEY` and `STRIPE_CONNECT_CLIENT_ID` now. Defer `STRIPE_WEBHOOK_SECRET` until the webhook function is deployed and we have its URL.

### Step 3 — Build the 5 edge functions

All use `npm:stripe@^17` import, manual CORS headers, and Zod validation on inputs.

1. **`stripe-connect-oauth-start`** (auth required)
   - Verifies caller is `business_admin` for their tenant
   - Builds Stripe OAuth URL: `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&scope=read_write&state=<signed-state>&redirect_uri=<callback-url>`
   - `state` = HMAC-signed JWT-like token containing `{tenant_id, user_id, nonce, exp}` signed with `STRIPE_SECRET_KEY` as HMAC key (avoids needing a separate secret)
   - Returns `{ url }` to client

2. **`stripe-connect-oauth-callback`** (public, no JWT — Stripe redirects browser here)
   - Receives `?code=...&state=...`
   - Verifies state HMAC + expiry, extracts `tenant_id` + `user_id`
   - Re-verifies user is still `business_admin` of that tenant
   - Calls `stripe.oauth.token({ grant_type: 'authorization_code', code })` → gets `stripe_user_id`
   - Calls `stripe.accounts.retrieve(stripe_user_id)` → gets email, charges_enabled, payouts_enabled
   - Upserts into `stripe_connected_accounts`
   - 302 redirect to `/settings?tab=financial&stripe=connected` (or `?stripe=error`)

3. **`stripe-connect-disconnect`** (auth required)
   - Verifies `business_admin`
   - Calls `stripe.oauth.deauthorize({ client_id, stripe_user_id })`
   - Sets `disconnected_at = now()` on the row
   - Returns `{ success: true }`

4. **`create-invoice-checkout`** (public, no JWT)
   - Body: `{ share_token }`
   - Rate limit: `enhanced_rate_limit_check(ip, 'invoice_checkout', 10, 60)`
   - Calls `get_public_invoice_by_token(share_token)` → gets invoice + tenant_id + stripe_enabled
   - If `!stripe_enabled` → 400
   - Service-role lookup of `stripe_connected_accounts.stripe_account_id` for that tenant
   - Creates `stripe.checkout.sessions.create({...}, { stripeAccount: stripe_account_id })` (Direct Charge):
     - `mode: 'payment'`
     - `payment_method_types: ['card', 'us_bank_account']`
     - One line item with invoice total + invoice number as description
     - `success_url: <publicInvoiceUrl>?paid=1`, `cancel_url: <publicInvoiceUrl>`
     - `metadata: { invoice_id, tenant_id, share_token }`
     - `payment_intent_data.metadata`: same
   - Stores `stripe_checkout_session_id` on invoice
   - Returns `{ url }` for client to redirect

5. **`stripe-webhook`** (public, no JWT, raw body required)
   - Reads raw body + `stripe-signature` header
   - `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` — rejects on bad signature
   - Handles `checkout.session.completed` and `payment_intent.succeeded`:
     - Looks up invoice by `metadata.invoice_id`
     - Updates: `status='paid'`, `paid_date=now()`, `payment_method_used='stripe_card'` (or `'stripe_ach'`), `stripe_payment_intent_id`
   - Returns `200 { received: true }` (always 200 unless signature fails — Stripe retries on non-2xx)
   - **Note:** because this is a Connect webhook (events from connected accounts), the endpoint we register in Stripe Dashboard is the "Connect" endpoint, not the regular one

### Step 4 — Settings UI: `PaymentMethodsSettings.tsx`

New component, mounted as a section inside `FinancialSettings.tsx` (replaces the current static PayPal/Venmo block).

- Header: "Payment Methods Customers Can Use"
- 7 checkboxes for `enabled_methods`:
  - Stripe (Card / ACH) — special row, see below
  - PayPal.me, Venmo, Cash App, Cash, Check, Bank Transfer
- For each checked manual method, conditionally render its config field:
  - PayPal → `paypal_me_link`
  - Venmo → `venmo_handle`
  - Cash App → `cashapp_handle`
  - Check → `check_payable_to`
  - Bank Transfer → `bank_transfer_instructions` (textarea)
- Stripe row:
  - Reads `stripe_connected_accounts` for current tenant
  - **Not connected:** "Connect Stripe Account" button → calls `stripe-connect-oauth-start` → `window.location.href = url`
  - **Connected & charges_enabled:** green badge "Connected as [email]" + "Disconnect" button
  - **Connected but charges_enabled=false:** amber warning "Stripe account connected but not yet enabled for payments — finish setup in your Stripe dashboard"
- On mount, if URL has `?stripe=connected`, show a success toast and clear the param

Persists to `settings.payment_settings` jsonb via existing `useSettings` hook (just add the new fields to the form schema).

### Step 5 — Update `PublicInvoice.tsx`

- Replace hardcoded PayPal/Venmo block with dynamic rendering driven by `payment_settings.enabled_methods` from the updated RPC
- Render order: Stripe first (if `stripe_enabled`), then manual methods in a defined order
- Stripe button: large primary "Pay $X.XX" → calls `create-invoice-checkout` → `window.location.href = url`
- Manual methods: each renders its own block (button to PayPal.me link, copyable Venmo/CashApp handle, plain text instructions for Cash/Check/Bank)
- On `?paid=1` return: poll the public invoice endpoint every 2s for up to 20s waiting for `status='paid'`, then show "Payment received ✓" success state. If timeout, show "Payment processing — this page will update shortly"

### Step 6 — `InvoiceCard.tsx` polish

- When `status='paid'` AND `payment_method_used` is set, show a small badge next to the status: "via Stripe", "via PayPal", "via Cash", etc.

### Step 7 — Final secret + Stripe Dashboard setup (user action, with my guidance)

After the webhook function is deployed, I'll give you:
1. The webhook endpoint URL (`https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/stripe-webhook`)
2. Instructions to register it in Stripe Dashboard → Developers → Webhooks → "Add endpoint" → **select "Connect" tab** → add `checkout.session.completed` and `payment_intent.succeeded` events
3. Then add the resulting `whsec_...` as the `STRIPE_WEBHOOK_SECRET` runtime secret
4. Also: in Stripe Dashboard → Settings → Connect → Settings → Redirect URIs, add `https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/stripe-connect-oauth-callback`

### Build order in execution

1. Fix `useCalendarJobs.tsx` (unblocks build)
2. Request `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_CLIENT_ID` secrets
3. Write all 5 edge functions (auto-deploy)
4. Build `PaymentMethodsSettings` UI + integrate into `FinancialSettings`
5. Rewrite `PublicInvoice` payment section
6. Add badge to `InvoiceCard`
7. Provide webhook URL + Stripe Dashboard setup instructions + request `STRIPE_WEBHOOK_SECRET`
8. End-to-end test: connect Stripe in test mode → create invoice → open public link → pay with `4242 4242 4242 4242` → verify webhook marks paid

### Things I'm explicitly NOT doing (per original scope)

- Saved cards / card-on-file
- Refunds UI
- Application fees (FieldFlow platform cut)
- Recurring/subscription auto-charge

