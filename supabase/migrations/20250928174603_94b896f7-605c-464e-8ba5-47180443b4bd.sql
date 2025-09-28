-- Fix search_path security warnings for functions

-- Update all functions to have secure search_path settings
CREATE OR REPLACE FUNCTION public.get_masked_customer_data(customer_row customers)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role user_role;
  result jsonb;
BEGIN
  -- Get current user role
  SELECT get_current_user_role() INTO user_role;
  
  -- Convert row to jsonb
  result := to_jsonb(customer_row);
  
  -- If user is contractor, mask sensitive data
  IF user_role = 'contractor' THEN
    -- Mask phone number (show only last 4 digits)
    IF customer_row.phone IS NOT NULL AND length(customer_row.phone) > 4 THEN
      result := jsonb_set(result, '{phone}', to_jsonb('***-***-' || right(customer_row.phone, 4)));
    END IF;
    
    -- Mask email (show only domain)
    IF customer_row.email IS NOT NULL AND position('@' in customer_row.email) > 0 THEN
      result := jsonb_set(result, '{email}', to_jsonb('***@' || split_part(customer_row.email, '@', 2)));
    END IF;
    
    -- Hide notes if they contain sensitive information
    IF customer_row.notes IS NOT NULL THEN
      result := jsonb_set(result, '{notes}', to_jsonb('[Sensitive information hidden]'));
    END IF;
  END IF;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_permission_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log permission changes for audit trail
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      old_values,
      new_values
    ) VALUES (
      COALESCE(NEW.tenant_id, OLD.tenant_id),
      auth.uid(),
      'permission_update',
      'user_permissions',
      COALESCE(NEW.id, OLD.id),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      new_values
    ) VALUES (
      NEW.tenant_id,
      auth.uid(),
      'permission_create',
      'user_permissions',
      NEW.id,
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      old_values
    ) VALUES (
      OLD.tenant_id,
      auth.uid(),
      'permission_delete',
      'user_permissions',
      OLD.id,
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enhanced_rate_limit_check(
  _identifier text, 
  _endpoint text, 
  _max_requests integer DEFAULT 100, 
  _window_minutes integer DEFAULT 60,
  _log_violations boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_count INTEGER;
    window_start TIMESTAMP WITH TIME ZONE;
    is_allowed BOOLEAN;
    result jsonb;
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
    
    -- Check if under limit
    is_allowed := current_count < _max_requests;
    
    -- If under limit, increment counter
    IF is_allowed THEN
        INSERT INTO public.rate_limits (identifier, endpoint, window_start, request_count)
        VALUES (_identifier, _endpoint, window_start, current_count + 1)
        ON CONFLICT (identifier, endpoint, window_start)
        DO UPDATE SET request_count = rate_limits.request_count + 1;
    ELSE
        -- Log rate limit violation if enabled
        IF _log_violations THEN
            INSERT INTO public.audit_logs (
                tenant_id,
                user_id,
                action,
                resource_type,
                old_values
            ) VALUES (
                NULL, -- System action
                NULL, -- System action
                'rate_limit_violation',
                'rate_limits',
                jsonb_build_object(
                    'identifier', _identifier,
                    'endpoint', _endpoint,
                    'current_count', current_count,
                    'max_requests', _max_requests,
                    'window_start', window_start
                )
            );
        END IF;
    END IF;
    
    -- Return detailed result
    result := jsonb_build_object(
        'allowed', is_allowed,
        'current_count', current_count + CASE WHEN is_allowed THEN 1 ELSE 0 END,
        'max_requests', _max_requests,
        'reset_time', window_start + (_window_minutes || ' minutes')::interval
    );
    
    RETURN result;
END;
$$;