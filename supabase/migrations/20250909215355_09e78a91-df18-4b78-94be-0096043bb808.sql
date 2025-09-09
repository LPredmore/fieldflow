-- Enable password protection against leaked passwords in Supabase Auth
-- This addresses the security linter warning about leaked password protection

-- Note: This setting is typically configured in the Supabase dashboard
-- Auth -> Settings -> Password Protection
-- For now, we'll document the requirement for manual configuration

-- Add a comment to track this security requirement
COMMENT ON SCHEMA public IS 'Security Note: Enable leaked password protection in Supabase Auth dashboard';