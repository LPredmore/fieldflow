

## Refresh & Harden Stripe Availability Check on Client Invoices

### What changes for the user
On `/client/invoices`, add a small "Refresh payment availability" button next to the page header that re-runs the Stripe connectivity check without a full page reload. While that check is running (or if it returns false), every "Pay Now" button on the page is disabled and shows a spinner with appropriate label, so a client can never click Pay during an unknown/negative Stripe state.

### Definitive technical decision

**Extract the Stripe availability state into a dedicated hook (`useStripeAvailability`) and tri-state it as `'loading' | 'enabled' | 'disabled'`, instead of keeping the current `boolean | null` inline in `ClientInvoices.tsx`.**

Why this and not the alternatives:

1. **Tri-state over boolean | null**: Today the page conflates "still checking" with "unknown" by using `null`. The two requirements explicitly require distinct UI for *loading* (spinner on Pay Now) and *disabled/false* (Pay Now hidden + helper text). A typed enum makes that distinction explicit and impossible to mis-render. This is also what the existing `payingInvoiceId` pattern already does for the per-invoice payment redirect, so the page stays internally consistent.

2. **Custom hook over inline state + React Query**: React Query isn't currently used anywhere in the client portal pages (`ClientInvoices`, `ClientQuotes`, `ClientJobs`, `ClientServiceRequest` all use `useState` + `useEffect` + direct `supabase` calls). Introducing it just for this single RPC would create a stylistic split inside the portal. A small custom hook keeps the portal's existing fetch idiom while giving us a clean `refresh()` function to wire to the new button. If the portal later migrates to React Query wholesale, this hook is a one-file swap.

3. **Re-check only Stripe, not the whole invoice list**: The user explicitly asked to refresh "without reloading the whole page". The current `useEffect` fetches invoices and Stripe status together in `Promise.all`. Splitting the Stripe RPC into its own hook means the refresh button only re-hits `is_stripe_enabled_for_customer` — fast, cheap, and won't blink the invoice cards.

4. **Disable, not hide, Pay Now during loading**: Today Pay Now is *conditionally rendered* only when `stripeEnabled === true`. During a refresh that would cause the button to disappear and reappear, which is jarring. Instead, when the hook is in `'loading'` state, render the button in a disabled+spinner state (matching the existing `payingInvoiceId` spinner pattern). When it's `'disabled'`, fall back to the existing helper-text path. This keeps layout stable and matches how the rest of the app handles async actions.

### Implementation

**1. New hook: `src/hooks/useStripeAvailability.tsx`**
- Signature: `useStripeAvailability(customerId: string | undefined)` → `{ status: 'loading' | 'enabled' | 'disabled', refresh: () => Promise<void>, lastCheckedAt: Date | null }`.
- Internally calls `supabase.rpc('is_stripe_enabled_for_customer', { _customer_id })`.
- Initial state `'loading'` when a `customerId` is present; `'disabled'` (with a no-op refresh) when no customer is loaded yet.
- `refresh()` sets status back to `'loading'`, awaits the RPC, sets `'enabled'` / `'disabled'` based on the boolean result, updates `lastCheckedAt`, and toasts on RPC error (using existing `useToast`).
- On error from the RPC, treat as `'disabled'` (fail-closed) so we never offer Pay Now on an indeterminate state.

**2. Refactor `src/pages/client/ClientInvoices.tsx`**
- Remove the `stripeEnabled` `useState` and the second item in the existing `Promise.all`. The `useEffect` now only fetches invoices.
- Call `const { status: stripeStatus, refresh: refreshStripe, lastCheckedAt } = useStripeAvailability(customer?.id)`.
- Add a header row with title + a `Button variant="outline" size="sm"` labeled "Refresh payment availability" with a `RefreshCw` icon. Disabled while `stripeStatus === 'loading'`; icon spins via `animate-spin` during loading. Below it, a muted `lastCheckedAt` timestamp ("Checked 2:14 PM") for transparency.
- Pay Now rendering rules per invoice (only for unpaid/non-cancelled with a `share_token`):
  - `stripeStatus === 'loading'` → render Pay Now disabled, with `Loader2` spinner and label "Checking payment availability…".
  - `stripeStatus === 'enabled'` → current behavior (clickable Pay Now, spinner swaps to "Starting payment…" once `payingInvoiceId === invoice.id`).
  - `stripeStatus === 'disabled'` → do not render Pay Now; show the existing "Online card payments are not available…" helper text (currently only shown when `stripeEnabled === false`).
- Keep the existing "View Invoice" button untouched — it's independent of Stripe.

**3. No database, RLS, or edge function changes**
The existing `is_stripe_enabled_for_customer` RPC and its grant to `authenticated` already cover this; we're just calling it more often and presenting its result more carefully.

### Edge cases handled

- **Refresh while a payment redirect is in flight**: `payingInvoiceId` is independent of `stripeStatus`. If the user clicks Refresh after clicking Pay Now, the page is already redirecting to Stripe Checkout via `window.location.href`, so the re-check result is irrelevant. No coordination needed.
- **Refresh with no customer loaded yet**: Hook returns `'disabled'` and refresh is a no-op — the header button is disabled until the customer profile resolves.
- **RPC error (network blip)**: Toast + `'disabled'`. Clicking Refresh again retries. Fail-closed prevents accidental Pay Now clicks against a stale "enabled" state.
- **Stale state across tab focus**: Out of scope for this change. If desired later, the hook can be extended with a `visibilitychange` listener — flagged but not built now.

### Files touched

```text
src/hooks/useStripeAvailability.tsx   (new)
src/pages/client/ClientInvoices.tsx   (refactor)
```

