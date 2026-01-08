-- Add 'client' to user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'client';

-- Add client_user_id to customers table to link authenticated clients to their customer record
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_client_user_id ON public.customers(client_user_id);

-- Create user_roles table for secure role management (following security best practices)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.user_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's primary role from user_roles table
CREATE OR REPLACE FUNCTION public.get_user_role_from_roles_table(_user_id UUID)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS policy for user_roles: users can read their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- RLS policy: only admins can manage roles
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'business_admin'))
WITH CHECK (public.has_role(auth.uid(), 'business_admin'));

-- RLS policies for clients to access their own customer record
CREATE POLICY "Clients can view their own customer record"
ON public.customers
FOR SELECT
TO authenticated
USING (
  client_user_id = auth.uid() 
  OR public.has_role(auth.uid(), 'business_admin')
  OR public.has_role(auth.uid(), 'contractor')
);

CREATE POLICY "Clients can update their own customer record"
ON public.customers
FOR UPDATE
TO authenticated
USING (client_user_id = auth.uid())
WITH CHECK (client_user_id = auth.uid());

-- Migrate existing users to user_roles table based on profiles.role
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;