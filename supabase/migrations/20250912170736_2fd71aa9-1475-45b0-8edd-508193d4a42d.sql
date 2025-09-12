-- Ensure settings table has default service_settings with emergency_rate_multiplier
UPDATE public.settings 
SET service_settings = COALESCE(
  service_settings, 
  '{}'::jsonb
) || '{
  "emergency_rate_multiplier": 1.5
}'::jsonb
WHERE service_settings IS NULL OR NOT (service_settings ? 'emergency_rate_multiplier');