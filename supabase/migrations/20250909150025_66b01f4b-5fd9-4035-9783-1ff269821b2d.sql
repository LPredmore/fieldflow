-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, phone, company_name)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email, 
    'business_admin',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'company_name'
  );
  
  -- Also create a settings record with the business name
  INSERT INTO public.settings (tenant_id, created_by_user_id, business_name)
  VALUES (NEW.id, NEW.id, NEW.raw_user_meta_data->>'company_name');
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
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