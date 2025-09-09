-- Add phone field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN phone TEXT;

-- Add company_name field to profiles table for easier access
ALTER TABLE public.profiles 
ADD COLUMN company_name TEXT;

-- Update the handle_new_user function to include phone and company_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_user_update function to include new fields
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;