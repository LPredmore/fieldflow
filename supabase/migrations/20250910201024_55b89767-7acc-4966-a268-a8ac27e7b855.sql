-- Fix the handle_new_user function to respect role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, phone, company_name, parent_admin_id)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'role', 'business_admin')::user_role,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'company_name',
    (NEW.raw_user_meta_data->>'parent_admin_id')::uuid
  );
  
  -- Only create settings record for business admins
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'business_admin') = 'business_admin' THEN
    INSERT INTO public.settings (tenant_id, created_by_user_id, business_name)
    VALUES (NEW.id, NEW.id, NEW.raw_user_meta_data->>'company_name');
  END IF;
  
  RETURN NEW;
END;
$function$