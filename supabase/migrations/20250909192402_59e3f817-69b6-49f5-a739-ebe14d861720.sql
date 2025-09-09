-- Fix infinite recursion in profiles RLS policy
-- First, create a security definer function to get user role safely
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Allow business admins to read their contractors" ON public.profiles;

-- Recreate the policy using the security definer function
CREATE POLICY "Allow business admins to read their contractors" 
ON public.profiles 
FOR SELECT 
USING (
  (auth.uid() = parent_admin_id) OR 
  (public.get_current_user_role() = 'business_admin' AND parent_admin_id = auth.uid())
);

-- Also update the get_user_tenant_id function to use the security definer function
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