-- Fix remaining search_path issues for all existing functions

-- Update all remaining functions to have secure search_path settings
CREATE OR REPLACE FUNCTION public.get_user_permissions(target_user_id uuid)
RETURNS TABLE(send_quotes boolean, access_services boolean, access_invoicing boolean, supervisor boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.send_quotes,
    up.access_services,
    up.access_invoicing,
    up.supervisor
  FROM public.user_permissions up
  WHERE up.user_id = target_user_id;
  
  -- If no permissions found, return default (all false)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, false, false, false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_identifier text, _endpoint text, _max_requests integer DEFAULT 100, _window_minutes integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.rate_limits 
  WHERE created_at < now() - interval '1 hour';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_share_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.validate_share_token_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ensure share tokens always have expiration dates
  IF NEW.share_token IS NOT NULL AND NEW.share_token_expires_at IS NULL THEN
    NEW.share_token_expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_quote_by_token(token_param text)
RETURNS TABLE(id uuid, quote_number text, customer_name text, title text, status quote_status, valid_until date, line_items jsonb, subtotal numeric, tax_amount numeric, total_amount numeric, notes text, terms text, tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
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
RETURNS TABLE(id uuid, invoice_number text, customer_name text, issue_date date, due_date date, status invoice_status, line_items jsonb, subtotal numeric, tax_rate numeric, tax_amount numeric, total_amount numeric, notes text, payment_terms text, tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parent_company_name text;
BEGIN
  -- For contractors, get the company name from their parent admin
  IF (NEW.raw_user_meta_data->>'parent_admin_id')::uuid IS NOT NULL THEN
    SELECT company_name INTO parent_company_name 
    FROM public.profiles 
    WHERE id = (NEW.raw_user_meta_data->>'parent_admin_id')::uuid;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, phone, company_name, parent_admin_id)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'role', 'business_admin')::user_role,
    NEW.raw_user_meta_data->>'phone',
    -- Use parent's company name for contractors, otherwise use provided company name
    COALESCE(parent_company_name, NEW.raw_user_meta_data->>'company_name'),
    (NEW.raw_user_meta_data->>'parent_admin_id')::uuid
  );
  
  -- Only create settings record for business admins
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'business_admin') = 'business_admin' THEN
    INSERT INTO public.settings (
      tenant_id, 
      created_by_user_id, 
      business_name,
      brand_color
    )
    VALUES (
      NEW.id, 
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'FieldFlow'),
      '#3b9cf7'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quote_response_input(_quote_id uuid, _response_type text, _customer_email text DEFAULT NULL::text, _customer_comments text DEFAULT NULL::text)
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

CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    full_name = NEW.raw_user_meta_data->>'full_name', 
    email = NEW.email,
    phone = NEW.raw_user_meta_data->>'phone',
    company_name = NEW.raw_user_meta_data->>'company_name'
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _user_role user_role;
  _parent_admin_id uuid;
BEGIN
  -- Use the security definer function to get role safely
  SELECT role, parent_admin_id INTO _user_role, _parent_admin_id 
  FROM public.profiles WHERE id = _user_id;
  
  IF _user_role = 'business_admin' THEN
    RETURN _user_id;
  ELSE -- contractor
    RETURN _parent_admin_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_quote_share_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Use gen_random_uuid() which works reliably, remove hyphens for URL-safe token
  RETURN replace(gen_random_uuid()::text, '-', '');
END;
$$;