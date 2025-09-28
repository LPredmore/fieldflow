-- Security Improvements: Enhanced Data Protection and Audit Logging

-- Create audit log table for tracking sensitive operations
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs within their tenant
CREATE POLICY "Admins can view audit logs within tenant"
ON public.audit_logs
FOR SELECT
USING (
  tenant_id = get_user_tenant_id() AND 
  get_current_user_role() = 'business_admin'
);

-- System can insert audit logs (for triggers)
CREATE POLICY "System can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (true);

-- Create function to mask sensitive customer data for contractors
CREATE OR REPLACE FUNCTION public.get_masked_customer_data(customer_row customers)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Create audit logging trigger function
CREATE OR REPLACE FUNCTION public.log_permission_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Create trigger for permission change auditing
CREATE TRIGGER audit_permission_changes
AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_permission_changes();

-- Enhanced rate limiting with better monitoring
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
SET search_path = public
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action, created_at DESC);