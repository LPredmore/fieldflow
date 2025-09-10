-- Fix RLS issue for generate_quote_share_token function
-- Make the function SECURITY DEFINER so it can be called without RLS restrictions

CREATE OR REPLACE FUNCTION public.generate_quote_share_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$function$;