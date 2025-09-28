-- Fix search_path for security compliance

-- Update the validation function to have fixed search_path
CREATE OR REPLACE FUNCTION public.validate_quote_response_input(
  _quote_id uuid,
  _response_type text,
  _customer_email text DEFAULT NULL,
  _customer_comments text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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