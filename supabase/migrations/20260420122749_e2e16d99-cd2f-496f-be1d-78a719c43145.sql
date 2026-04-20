-- 1. Create stripe_connected_accounts table
CREATE TABLE public.stripe_connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  stripe_account_id text NOT NULL UNIQUE,
  account_email text,
  display_name text,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view their tenant Stripe account"
  ON public.stripe_connected_accounts FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins insert their tenant Stripe account"
  ON public.stripe_connected_accounts FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins update their tenant Stripe account"
  ON public.stripe_connected_accounts FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins delete their tenant Stripe account"
  ON public.stripe_connected_accounts FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

CREATE TRIGGER trg_stripe_connected_accounts_updated_at
  BEFORE UPDATE ON public.stripe_connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Extend invoices table
ALTER TABLE public.invoices
  ADD COLUMN stripe_payment_intent_id text,
  ADD COLUMN stripe_checkout_session_id text,
  ADD COLUMN payment_method_used text;

CREATE INDEX idx_invoices_stripe_session ON public.invoices(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX idx_invoices_stripe_pi ON public.invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- 3. Update get_public_invoice_by_token to expose payment config (without leaking stripe_account_id)
DROP FUNCTION IF EXISTS public.get_public_invoice_by_token(text);

CREATE OR REPLACE FUNCTION public.get_public_invoice_by_token(token_param text)
 RETURNS TABLE(
   id uuid,
   invoice_number text,
   customer_name text,
   issue_date date,
   due_date date,
   status invoice_status,
   line_items jsonb,
   subtotal numeric,
   tax_rate numeric,
   tax_amount numeric,
   total_amount numeric,
   notes text,
   payment_terms text,
   tenant_id uuid,
   payment_method_used text,
   payment_settings jsonb,
   stripe_enabled boolean
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    i.id,
    i.invoice_number,
    i.customer_name,
    i.issue_date,
    i.due_date,
    i.status,
    i.line_items,
    i.subtotal,
    i.tax_rate,
    i.tax_amount,
    i.total_amount,
    i.notes,
    i.payment_terms,
    i.tenant_id,
    i.payment_method_used,
    COALESCE(s.payment_settings, '{}'::jsonb) AS payment_settings,
    EXISTS (
      SELECT 1 FROM public.stripe_connected_accounts sca
      WHERE sca.tenant_id = i.tenant_id
        AND sca.disconnected_at IS NULL
        AND sca.charges_enabled = true
    ) AS stripe_enabled
  FROM public.invoices i
  LEFT JOIN public.settings s ON s.tenant_id = i.tenant_id
  WHERE i.share_token = token_param
    AND i.share_token IS NOT NULL 
    AND i.share_token_expires_at IS NOT NULL 
    AND i.share_token_expires_at > now();
$function$;