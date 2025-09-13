-- Update the handle_new_user function to set default business settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
$function$