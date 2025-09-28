-- Update existing share tokens to add expiration dates (30 days from now)
-- This ensures backward compatibility while securing existing tokens

UPDATE public.invoices 
SET share_token_expires_at = now() + interval '30 days'
WHERE share_token IS NOT NULL 
AND share_token_expires_at IS NULL;

UPDATE public.quotes 
SET share_token_expires_at = now() + interval '30 days'
WHERE share_token IS NOT NULL 
AND share_token_expires_at IS NULL;

-- Create a function to periodically clean up expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_share_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Clear expired invoice share tokens
    UPDATE public.invoices 
    SET share_token = NULL, share_token_expires_at = NULL
    WHERE share_token_expires_at < now();
    
    -- Clear expired quote share tokens
    UPDATE public.quotes 
    SET share_token = NULL, share_token_expires_at = NULL
    WHERE share_token_expires_at < now();
    
    -- Also clean up old access logs (keep only last 90 days)
    DELETE FROM public.shared_content_access_logs 
    WHERE accessed_at < now() - interval '90 days';
    
    -- Clean up old rate limit entries  
    PERFORM public.cleanup_expired_rate_limits();
END;
$$;