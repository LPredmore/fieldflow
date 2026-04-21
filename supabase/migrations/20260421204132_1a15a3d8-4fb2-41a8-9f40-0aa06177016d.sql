ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS email_from_address text,
  ADD COLUMN IF NOT EXISTS email_from_name text;

-- Seed the existing flo-pro.org tenant. Targets any settings row whose business_email
-- is on the flo-pro.org domain, so this is safe even if there is more than one.
UPDATE public.settings
SET email_from_address = 'info@flo-pro.org',
    email_from_name    = COALESCE(email_from_name, business_name, 'Flo-Pro')
WHERE business_email ILIKE '%@flo-pro.org'
   OR business_website ILIKE '%flo-pro.org%';