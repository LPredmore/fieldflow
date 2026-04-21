
-- Phone normalization function (US-focused with international fallback)
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _digits text;
BEGIN
  IF _phone IS NULL OR length(trim(_phone)) = 0 THEN
    RETURN NULL;
  END IF;

  -- If already starts with +, strip non-digits after the +
  IF left(trim(_phone), 1) = '+' THEN
    _digits := regexp_replace(substring(trim(_phone) from 2), '[^0-9]', '', 'g');
    IF length(_digits) BETWEEN 8 AND 15 THEN
      RETURN '+' || _digits;
    END IF;
    RETURN NULL;
  END IF;

  -- Otherwise extract digits, assume US if 10 digits, US if 11 starting with 1
  _digits := regexp_replace(_phone, '[^0-9]', '', 'g');

  IF length(_digits) = 10 THEN
    RETURN '+1' || _digits;
  ELSIF length(_digits) = 11 AND left(_digits, 1) = '1' THEN
    RETURN '+' || _digits;
  ELSIF length(_digits) BETWEEN 8 AND 15 THEN
    -- Best-effort: prepend + (caller may not be US)
    RETURN '+' || _digits;
  END IF;

  RETURN NULL;
END;
$$;

-- Add generated phone_e164 column to customers
ALTER TABLE public.customers
  ADD COLUMN phone_e164 text GENERATED ALWAYS AS (public.normalize_phone_e164(phone)) STORED;

CREATE INDEX IF NOT EXISTS customers_phone_e164_idx ON public.customers(tenant_id, phone_e164);

-- ============================================================================
-- sms_settings table
-- ============================================================================
CREATE TABLE public.sms_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  twilio_connection_id text,
  from_number_e164 text,
  messaging_service_sid text,
  campaign_status text NOT NULL DEFAULT 'not_started'
    CHECK (campaign_status IN ('not_started','pending','approved','rejected')),
  campaign_status_checked_at timestamptz,
  campaign_rejection_reason text,
  test_message_sent_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  notification_events jsonb NOT NULL DEFAULT jsonb_build_object(
    'job_reminder_24h', true,
    'on_the_way', true,
    'quote_sent', false,
    'invoice_sent', false,
    'invoice_overdue', false
  ),
  daily_send_cap integer NOT NULL DEFAULT 500,
  ein text,
  business_website text,
  campaign_use_case text DEFAULT 'Customer Care',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view their sms_settings"
  ON public.sms_settings FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins insert their sms_settings"
  ON public.sms_settings FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins update their sms_settings"
  ON public.sms_settings FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins delete their sms_settings"
  ON public.sms_settings FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE TRIGGER sms_settings_updated_at
  BEFORE UPDATE ON public.sms_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- sms_opt_outs table
-- ============================================================================
CREATE TABLE public.sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'stop_keyword'
    CHECK (reason IN ('stop_keyword','help_request','manual','bounce')),
  UNIQUE (tenant_id, phone_e164)
);

CREATE INDEX sms_opt_outs_lookup_idx ON public.sms_opt_outs(tenant_id, phone_e164);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view tenant opt outs"
  ON public.sms_opt_outs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins insert tenant opt outs"
  ON public.sms_opt_outs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Admins delete tenant opt outs"
  ON public.sms_opt_outs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

-- ============================================================================
-- sms_messages table
-- ============================================================================
CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  to_number_e164 text NOT NULL,
  from_number_e164 text,
  body text NOT NULL,
  twilio_sid text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','failed','received','undelivered')),
  error_code text,
  triggered_by text,
  related_entity_type text,
  related_entity_id uuid,
  triggered_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_messages_tenant_idx ON public.sms_messages(tenant_id, created_at DESC);
CREATE INDEX sms_messages_related_idx ON public.sms_messages(related_entity_type, related_entity_id);
CREATE INDEX sms_messages_to_idx ON public.sms_messages(tenant_id, to_number_e164);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all tenant sms messages"
  ON public.sms_messages FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Contractors view their triggered sms messages"
  ON public.sms_messages FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND triggered_by_user_id = auth.uid());

-- No direct insert/update/delete policies — only edge functions (service role) write.

-- ============================================================================
-- Helper: check if a phone number is opted out
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_phone_opted_out(_tenant_id uuid, _phone_e164 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sms_opt_outs
    WHERE tenant_id = _tenant_id AND phone_e164 = _phone_e164
  );
$$;
