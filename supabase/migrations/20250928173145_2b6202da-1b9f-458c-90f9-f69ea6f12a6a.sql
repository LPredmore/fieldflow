-- Security Fix: Remove public insert vulnerabilities and add proper validation

-- 1. Remove overly permissive public insert policy on quote_responses
DROP POLICY IF EXISTS "Allow public insert on quote_responses" ON public.quote_responses;

-- 2. Add a more secure policy that only allows inserts with valid quote tokens
CREATE POLICY "Allow quote responses for valid tokens"
ON public.quote_responses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes 
    WHERE id = quote_id 
    AND share_token IS NOT NULL 
    AND share_token_expires_at > now()
  )
  AND response_type IN ('accepted', 'declined', 'viewed')
  AND length(coalesce(customer_email, '')) <= 255
  AND length(coalesce(customer_comments, '')) <= 1000
);

-- 3. Remove overly permissive public insert policy on shared_content_access_logs  
DROP POLICY IF EXISTS "Allow public insertion of access logs" ON public.shared_content_access_logs;

-- 4. Add a more secure policy for access logs that validates content exists
CREATE POLICY "Allow access logs for valid shared content"
ON public.shared_content_access_logs
FOR INSERT  
WITH CHECK (
  (
    content_type = 'quote' AND
    EXISTS (
      SELECT 1 FROM public.quotes 
      WHERE id = content_id 
      AND share_token IS NOT NULL 
      AND share_token_expires_at > now()
    )
  ) OR (
    content_type = 'invoice' AND  
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE id = content_id
      AND share_token IS NOT NULL
      AND share_token_expires_at > now()  
    )
  )
  AND content_type IN ('quote', 'invoice')
  AND length(coalesce(share_token, '')) > 0
);

-- 5. Add input validation function for quote responses
CREATE OR REPLACE FUNCTION public.validate_quote_response_input(
  _quote_id uuid,
  _response_type text,
  _customer_email text DEFAULT NULL,
  _customer_comments text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate response type
  IF _response_type NOT IN ('accepted', 'declined', 'viewed') THEN
    RETURN false;
  END IF;
  
  -- Validate email format if provided
  IF _customer_email IS NOT NULL AND _customer_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN false;
  END IF;
  
  -- Validate comment length
  IF _customer_comments IS NOT NULL AND length(_customer_comments) > 1000 THEN
    RETURN false;
  END IF;
  
  -- Validate quote exists and is accessible
  IF NOT EXISTS (
    SELECT 1 FROM public.quotes 
    WHERE id = _quote_id 
    AND share_token IS NOT NULL 
    AND share_token_expires_at > now()
  ) THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;