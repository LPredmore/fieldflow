-- Fix function search path security issue
CREATE OR REPLACE FUNCTION generate_quote_share_token()
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$;