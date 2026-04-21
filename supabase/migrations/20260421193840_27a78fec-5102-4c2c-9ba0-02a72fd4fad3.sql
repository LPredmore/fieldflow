-- =========================================
-- Notifications layer: email log + reminder/followup tracking
-- =========================================

-- 1. email_messages: audit trail mirroring sms_messages
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  to_email text NOT NULL,
  from_email text,
  subject text NOT NULL,
  body_html text,
  body_text text,
  resend_id text,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | failed | bounced
  error_code text,
  triggered_by text, -- 'job_reminder_crew' | 'quote_followup' | 'invoice_overdue' | 'quote_sent' | 'invoice_sent' | 'on_the_way' | 'manual'
  related_entity_type text, -- 'job_occurrence' | 'invoice' | 'quote'
  related_entity_id uuid,
  triggered_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_messages_tenant_created ON public.email_messages (tenant_id, created_at DESC);
CREATE INDEX idx_email_messages_related ON public.email_messages (related_entity_type, related_entity_id);
CREATE INDEX idx_email_messages_triggered_by ON public.email_messages (tenant_id, triggered_by, created_at DESC);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all tenant email messages"
  ON public.email_messages FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

CREATE POLICY "Contractors view their triggered email messages"
  ON public.email_messages FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND triggered_by_user_id = auth.uid());

-- 2. notification_dispatches: idempotency table to prevent duplicate sends from cron
CREATE TABLE public.notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_key text NOT NULL,
  -- e.g. 'crew_reminder:<contractor_id>:<YYYY-MM-DD>'
  --      'quote_followup:<quote_id>:day3'
  --      'invoice_overdue:<invoice_id>:day7'
  --      'on_the_way:<occurrence_id>'
  channel text NOT NULL, -- 'sms' | 'email'
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  sms_message_id uuid,
  email_message_id uuid,
  UNIQUE (tenant_id, event_key, channel)
);

CREATE INDEX idx_notification_dispatches_lookup ON public.notification_dispatches (tenant_id, event_key);

ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view dispatch log"
  ON public.notification_dispatches FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'business_admin'::user_role));

-- 3. Extend sms_settings.notification_events with new event toggles
-- (jsonb is flexible; default just adds the new keys for new rows)
ALTER TABLE public.sms_settings
  ALTER COLUMN notification_events SET DEFAULT jsonb_build_object(
    'job_reminder_24h', true,
    'job_reminder_crew', true,
    'on_the_way', true,
    'quote_sent', false,
    'quote_followup', false,
    'invoice_sent', false,
    'invoice_overdue', true
  );

-- Backfill existing rows so missing keys exist
UPDATE public.sms_settings
SET notification_events = notification_events
  || jsonb_build_object(
       'job_reminder_crew', COALESCE(notification_events->>'job_reminder_crew', 'true')::boolean,
       'quote_followup',    COALESCE(notification_events->>'quote_followup',    'false')::boolean
     );

-- 4. notification_email_events on settings table for per-event email toggles
-- Stored inside existing notification_settings jsonb (no schema change needed),
-- but document the keys here for future reference. Defaults applied client-side.

-- 5. Auto-trigger "on the way" SMS when a contractor clocks in
-- This fires via pg_net to the send-sms edge function. We store the anon key as a vault secret
-- so the SQL trigger doesn't need to embed it inline.

-- Use vault to store the anon key (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_anon_key') THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxb2huYWd2bnZwY3pkdW9pemRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQwOTgsImV4cCI6MjA3MzAwMDA5OH0.YYMJlLPl2yn8Khk3bTcwIHs2OQdAVUuYgAOgfvYeOqs',
      'edge_anon_key',
      'Anon key for invoking edge functions from db triggers/cron'
    );
  END IF;
END$$;

-- Trigger function: on time_entries insert (status=active = clock-in), call notify-on-the-way edge function
CREATE OR REPLACE FUNCTION public.trigger_on_the_way_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anon_key text;
BEGIN
  -- Only fire on initial clock-in (active status, has occurrence)
  IF NEW.status = 'active' AND NEW.job_occurrence_id IS NOT NULL THEN
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
$$;

CREATE TRIGGER on_time_entry_clock_in
  AFTER INSERT ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_the_way_notification();

-- 6. Schedule the new daily workers (existing hourly job-reminders cron stays as-is)

-- Crew reminders: every hour, but each tenant's worker checks if it's 6pm local
SELECT cron.schedule(
  'sms-crew-reminders-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/sms-crew-reminders',
    headers := (SELECT jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || decrypted_secret
    ) FROM vault.decrypted_secrets WHERE name = 'edge_anon_key'),
    body := jsonb_build_object('time', now())
  );
  $cron$
);

-- Quote follow-ups: daily at 9am UTC (workers shift to tenant local internally if needed)
SELECT cron.schedule(
  'quote-followup-daily',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/quote-followup-worker',
    headers := (SELECT jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || decrypted_secret
    ) FROM vault.decrypted_secrets WHERE name = 'edge_anon_key'),
    body := jsonb_build_object('time', now())
  );
  $cron$
);

-- Invoice overdue: daily at 9am UTC
SELECT cron.schedule(
  'invoice-overdue-daily',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/invoice-overdue-worker',
    headers := (SELECT jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || decrypted_secret
    ) FROM vault.decrypted_secrets WHERE name = 'edge_anon_key'),
    body := jsonb_build_object('time', now())
  );
  $cron$
);
