-- 1. Add public_portal_base_url to settings (used to build customer-facing share links)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS public_portal_base_url text;

-- 2. Drop unused ignore table
DROP TABLE IF EXISTS public.ignore;

-- 3. Tighten the on_the_way trigger function:
--    - skip manual entries
--    - only fire within 15 min of the clock-in timestamp (no back-dating)
--    - require the inserter to actually be the assigned contractor
CREATE OR REPLACE FUNCTION public.trigger_on_the_way_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _anon_key text;
  _assigned uuid;
BEGIN
  -- Only fire on initial clock-in (active status, has occurrence)
  IF NEW.status = 'active' AND NEW.job_occurrence_id IS NOT NULL THEN
    -- Skip back-dated / manual corrections
    IF NEW.manual_entry IS TRUE THEN
      RETURN NEW;
    END IF;
    IF NEW.clock_in_at < now() - interval '15 minutes' THEN
      RETURN NEW;
    END IF;

    -- Anti-spoof: inserter must be the assigned contractor on this occurrence
    SELECT assigned_to_user_id INTO _assigned
    FROM public.job_occurrences
    WHERE id = NEW.job_occurrence_id;

    IF _assigned IS NULL OR _assigned <> NEW.user_id THEN
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO _anon_key FROM vault.decrypted_secrets WHERE name = 'edge_anon_key';
    PERFORM net.http_post(
      url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/notify-on-the-way',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _anon_key
      ),
      body := jsonb_build_object(
        'time_entry_id', NEW.id,
        'job_occurrence_id', NEW.job_occurrence_id,
        'tenant_id', NEW.tenant_id,
        'contractor_id', NEW.user_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Re-seed email_from_address for the actual flo-pro.org tenant.
--    The previous migration's WHERE clause matched zero rows because no tenant
--    had business_email on flo-pro.org. Target the admin profile by known email.
UPDATE public.settings s
SET email_from_address = 'info@flo-pro.org',
    email_from_name    = COALESCE(email_from_name, s.business_name, 'Flo-Pro')
WHERE s.tenant_id IN (
  SELECT id FROM public.profiles
  WHERE email = 'predmoreluke@gmail.com'
    AND role = 'business_admin'
);