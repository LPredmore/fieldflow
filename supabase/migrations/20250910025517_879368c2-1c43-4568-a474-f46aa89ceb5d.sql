-- Fix the generate_quote_share_token function to use gen_random_uuid() instead of gen_random_bytes()
-- This resolves the 500 error in the send-quote-email edge function

CREATE OR REPLACE FUNCTION public.generate_quote_share_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use gen_random_uuid() which works reliably, remove hyphens for URL-safe token
  RETURN replace(gen_random_uuid()::text, '-', '');
END;
$function$;