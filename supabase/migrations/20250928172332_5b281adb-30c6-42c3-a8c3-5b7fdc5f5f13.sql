-- SECURITY FIX: Restrict public access to quotes and invoices with proper data masking

-- Step 1: Update RLS policies to require expiration dates (no indefinite tokens)
DROP POLICY IF EXISTS "Allow public read access via valid share_token" ON public.quotes;
DROP POLICY IF EXISTS "Allow public read access via valid share_token" ON public.invoices;

-- Step 2: Create secure public views with limited data exposure
CREATE OR REPLACE VIEW public.public_quotes AS
SELECT 
  id,
  quote_number,
  customer_name,
  title,
  status,
  valid_until,
  line_items,
  subtotal,
  tax_amount,
  total_amount,
  notes,
  terms,
  share_token,
  share_token_expires_at,
  tenant_id  -- needed for business settings lookup
FROM public.quotes
WHERE 
  share_token IS NOT NULL 
  AND share_token_expires_at IS NOT NULL 
  AND share_token_expires_at > now();

CREATE OR REPLACE VIEW public.public_invoices AS
SELECT 
  id,
  invoice_number,
  customer_name,
  issue_date,
  due_date,
  status,
  line_items,
  subtotal,
  tax_rate,
  tax_amount,
  total_amount,
  notes,
  payment_terms,
  share_token,
  share_token_expires_at,
  tenant_id  -- needed for business settings lookup
FROM public.invoices
WHERE 
  share_token IS NOT NULL 
  AND share_token_expires_at IS NOT NULL 
  AND share_token_expires_at > now();

-- Step 3: Enable RLS on the views and set public access policies
ALTER VIEW public.public_quotes SET (security_barrier = true);
ALTER VIEW public.public_invoices SET (security_barrier = true);

-- Grant public access to the views
GRANT SELECT ON public.public_quotes TO anon;
GRANT SELECT ON public.public_invoices TO anon;

-- Step 4: Restrict rate_limits table access (currently completely open)
DROP POLICY IF EXISTS "Allow public rate limit tracking" ON public.rate_limits;

-- Only allow system processes to access rate limits
CREATE POLICY "System rate limit access only" ON public.rate_limits
FOR ALL USING (false);  -- Deny all public access

-- Allow service role access for edge functions
CREATE POLICY "Service role rate limit access" ON public.rate_limits
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Step 5: Update existing share tokens to have expiration dates
-- Set 30-day expiration for any existing tokens without expiration
UPDATE public.quotes 
SET share_token_expires_at = now() + interval '30 days'
WHERE share_token IS NOT NULL 
  AND share_token_expires_at IS NULL;

UPDATE public.invoices 
SET share_token_expires_at = now() + interval '30 days'
WHERE share_token IS NOT NULL 
  AND share_token_expires_at IS NULL;

-- Step 6: Add function to ensure all new share tokens have expiration dates
CREATE OR REPLACE FUNCTION public.validate_share_token_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure share tokens always have expiration dates
  IF NEW.share_token IS NOT NULL AND NEW.share_token_expires_at IS NULL THEN
    NEW.share_token_expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers to enforce expiration dates
DROP TRIGGER IF EXISTS ensure_quote_token_expiration ON public.quotes;
CREATE TRIGGER ensure_quote_token_expiration
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.validate_share_token_expiration();

DROP TRIGGER IF EXISTS ensure_invoice_token_expiration ON public.invoices;
CREATE TRIGGER ensure_invoice_token_expiration
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_share_token_expiration();