-- =============================================================
-- Dispatch Board & Geocoding Schema
-- =============================================================

-- 1) Customers: lat/lng + geocoding metadata
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lat numeric NULL,
  ADD COLUMN IF NOT EXISTS lng numeric NULL,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS geocoding_status text NULL,
  ADD COLUMN IF NOT EXISTS address_hash text NULL;

-- 2) Profiles: contractor home base
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_base_address jsonb NULL,
  ADD COLUMN IF NOT EXISTS home_base_lat numeric NULL,
  ADD COLUMN IF NOT EXISTS home_base_lng numeric NULL,
  ADD COLUMN IF NOT EXISTS home_base_geocoded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS home_base_address_hash text NULL;

-- 3) Job occurrences: dispatch sequence & cached drive ETA
ALTER TABLE public.job_occurrences
  ADD COLUMN IF NOT EXISTS dispatch_sequence integer NULL,
  ADD COLUMN IF NOT EXISTS drive_minutes_from_prev integer NULL;

-- =============================================================
-- Address normalization + hashing helper
-- =============================================================
CREATE OR REPLACE FUNCTION public.normalize_address_jsonb(_addr jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(
    coalesce(_addr->>'street','') || '|' ||
    coalesce(_addr->>'city','')   || '|' ||
    coalesce(_addr->>'state','')  || '|' ||
    coalesce(_addr->>'zip','')    || '|' ||
    coalesce(_addr->>'country',''),
    '\s+', ' ', 'g'
  ));
$$;

-- =============================================================
-- Trigger: customers — clear lat/lng when address changes
-- =============================================================
CREATE OR REPLACE FUNCTION public.customers_address_hash_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_hash text;
BEGIN
  _new_hash := md5(public.normalize_address_jsonb(NEW.address));
  IF NEW.address_hash IS DISTINCT FROM _new_hash THEN
    NEW.address_hash := _new_hash;
    -- If address actually changed (not just first-set), clear cache
    IF TG_OP = 'UPDATE' AND OLD.address_hash IS DISTINCT FROM _new_hash THEN
      -- Allow caller to set lat/lng manually in same update (manual pin)
      IF NEW.lat IS NOT DISTINCT FROM OLD.lat AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
        NEW.lat := NULL;
        NEW.lng := NULL;
        NEW.geocoded_at := NULL;
        NEW.geocoding_status := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_address_hash_trigger ON public.customers;
CREATE TRIGGER customers_address_hash_trigger
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.customers_address_hash_fn();

-- =============================================================
-- Trigger: profiles — clear home base lat/lng when address changes
-- =============================================================
CREATE OR REPLACE FUNCTION public.profiles_home_base_hash_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_hash text;
BEGIN
  _new_hash := md5(public.normalize_address_jsonb(NEW.home_base_address));
  IF NEW.home_base_address_hash IS DISTINCT FROM _new_hash THEN
    NEW.home_base_address_hash := _new_hash;
    IF TG_OP = 'UPDATE' AND OLD.home_base_address_hash IS DISTINCT FROM _new_hash THEN
      IF NEW.home_base_lat IS NOT DISTINCT FROM OLD.home_base_lat
         AND NEW.home_base_lng IS NOT DISTINCT FROM OLD.home_base_lng THEN
        NEW.home_base_lat := NULL;
        NEW.home_base_lng := NULL;
        NEW.home_base_geocoded_at := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_home_base_hash_trigger ON public.profiles;
CREATE TRIGGER profiles_home_base_hash_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_home_base_hash_fn();

-- =============================================================
-- RPC: list customers in caller's tenant that still need geocoding
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_unbatched_geocoding_targets(_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  name text,
  address jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.address
  FROM public.customers c
  WHERE c.tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'business_admin'::user_role)
    AND c.address IS NOT NULL
    AND (c.lat IS NULL OR c.lng IS NULL)
    AND coalesce(c.geocoding_status, '') <> 'failed'
  ORDER BY c.created_at DESC
  LIMIT _limit;
$$;

-- =============================================================
-- Index helpers
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_customers_tenant_geocoded
  ON public.customers(tenant_id) WHERE lat IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_occurrences_assigned_day
  ON public.job_occurrences(tenant_id, assigned_to_user_id, start_at);
