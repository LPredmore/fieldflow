-- Add expiration dates to share tokens for security
ALTER TABLE public.invoices 
ADD COLUMN share_token_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.quotes 
ADD COLUMN share_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Add access logging for shared content security monitoring
CREATE TABLE public.shared_content_access_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('invoice', 'quote')),
    content_id UUID NOT NULL,
    share_token TEXT NOT NULL,
    accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT
);

-- Enable RLS on the new logging table
ALTER TABLE public.shared_content_access_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to view their tenant's access logs
CREATE POLICY "Users can view access logs for their tenant content"
ON public.shared_content_access_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.invoices 
        WHERE invoices.id = content_id 
        AND invoices.tenant_id = get_user_tenant_id()
        AND content_type = 'invoice'
    )
    OR
    EXISTS (
        SELECT 1 FROM public.quotes 
        WHERE quotes.id = content_id 
        AND quotes.tenant_id = get_user_tenant_id()
        AND content_type = 'quote'
    )
);

-- Policy to allow public insertion of access logs (for tracking shared access)
CREATE POLICY "Allow public insertion of access logs"
ON public.shared_content_access_logs
FOR INSERT
WITH CHECK (true);

-- Update RLS policies for invoices to check token expiration
DROP POLICY IF EXISTS "Allow public read access via share_token" ON public.invoices;
CREATE POLICY "Allow public read access via valid share_token"
ON public.invoices
FOR SELECT
USING (
    share_token IS NOT NULL 
    AND (share_token_expires_at IS NULL OR share_token_expires_at > now())
);

-- Update RLS policies for quotes to check token expiration
DROP POLICY IF EXISTS "Allow public read access via share_token" ON public.quotes;
CREATE POLICY "Allow public read access via valid share_token"
ON public.quotes
FOR SELECT
USING (
    share_token IS NOT NULL 
    AND (share_token_expires_at IS NULL OR share_token_expires_at > now())
);

-- Add rate limiting table for public endpoints
CREATE TABLE public.rate_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT NOT NULL, -- IP address or token
    endpoint TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(identifier, endpoint, window_start)
);

-- Enable RLS on rate limits table
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy to allow public access for rate limiting functionality
CREATE POLICY "Allow public rate limit tracking"
ON public.rate_limits
FOR ALL
USING (true)
WITH CHECK (true);

-- Function to clean up expired rate limit entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits 
  WHERE created_at < now() - interval '1 hour';
$$;

-- Function to check rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    _identifier TEXT,
    _endpoint TEXT,
    _max_requests INTEGER DEFAULT 100,
    _window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count INTEGER;
    window_start TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate window start time
    window_start := date_trunc('hour', now()) + 
                   (EXTRACT(minute FROM now())::integer / _window_minutes) * 
                   (_window_minutes || ' minutes')::interval;
    
    -- Get current count for this identifier and endpoint in current window
    SELECT COALESCE(request_count, 0) INTO current_count
    FROM public.rate_limits
    WHERE identifier = _identifier 
    AND endpoint = _endpoint 
    AND window_start = window_start;
    
    -- If under limit, increment counter
    IF current_count < _max_requests THEN
        INSERT INTO public.rate_limits (identifier, endpoint, window_start, request_count)
        VALUES (_identifier, _endpoint, window_start, current_count + 1)
        ON CONFLICT (identifier, endpoint, window_start)
        DO UPDATE SET request_count = rate_limits.request_count + 1;
        
        RETURN true;
    END IF;
    
    -- Over limit
    RETURN false;
END;
$$;