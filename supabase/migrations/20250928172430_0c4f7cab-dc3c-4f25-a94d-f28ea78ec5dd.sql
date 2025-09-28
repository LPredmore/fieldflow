-- FIX: Use functions instead of views for secure public access

-- Step 1: Drop the failed views
DROP VIEW IF EXISTS public.public_quotes;
DROP VIEW IF EXISTS public.public_invoices;

-- Step 2: Create secure functions that return limited data
CREATE OR REPLACE FUNCTION public.get_public_quote_by_token(token_param text)
RETURNS TABLE (
  id uuid,
  quote_number text,
  customer_name text,
  title text,
  status quote_status,
  valid_until date,
  line_items jsonb,
  subtotal numeric,
  tax_amount numeric,
  total_amount numeric,
  notes text,
  terms text,
  tenant_id uuid
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    q.id,
    q.quote_number,
    q.customer_name,
    q.title,
    q.status,
    q.valid_until,
    q.line_items,
    q.subtotal,
    q.tax_amount,
    q.total_amount,
    q.notes,
    q.terms,
    q.tenant_id
  FROM quotes q
  WHERE q.share_token = token_param
    AND q.share_token IS NOT NULL 
    AND q.share_token_expires_at IS NOT NULL 
    AND q.share_token_expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.get_public_invoice_by_token(token_param text)
RETURNS TABLE (
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
  tenant_id uuid
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    i.tenant_id
  FROM invoices i
  WHERE i.share_token = token_param
    AND i.share_token IS NOT NULL 
    AND i.share_token_expires_at IS NOT NULL 
    AND i.share_token_expires_at > now();
$$;

-- Step 3: Grant execute permissions to anon users
GRANT EXECUTE ON FUNCTION public.get_public_quote_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_invoice_by_token(text) TO anon;