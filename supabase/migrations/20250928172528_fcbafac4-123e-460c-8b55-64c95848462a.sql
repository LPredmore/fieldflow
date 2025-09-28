-- FIX: Set search_path for all remaining functions to resolve security warning

-- Update all functions to have proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_share_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;