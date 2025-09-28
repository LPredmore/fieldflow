-- Security Enhancement: Fix RLS Policy Issues

-- Drop the redundant profile policies and create a cleaner, more maintainable version
DROP POLICY IF EXISTS "Allow authenticated users to read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow business admins to read their contractors" ON public.profiles;

-- Create a unified, clearer profile access policy
CREATE POLICY "Users can read own profile and admins can read their contractors"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR 
  (get_current_user_role() = 'business_admin' AND auth.uid() = parent_admin_id)
);

-- Fix conflicting rate limit policies by dropping the conflicting one
DROP POLICY IF EXISTS "System rate limit access only" ON public.rate_limits;

-- Keep only the service role policy for rate limits (this is correct for system operations)
-- The "Service role rate limit access" policy already exists and is appropriate

-- Add index for better performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_profiles_parent_admin_id ON public.profiles(parent_admin_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits(identifier, endpoint, window_start);