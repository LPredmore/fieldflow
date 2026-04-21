-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sms-job-reminders-hourly') THEN
    PERFORM cron.unschedule('sms-job-reminders-hourly');
  END IF;
END$$;

-- Schedule hourly run
SELECT cron.schedule(
  'sms-job-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/sms-job-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxb2huYWd2bnZwY3pkdW9pemRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjQwOTgsImV4cCI6MjA3MzAwMDA5OH0.YYMJlLPl2yn8Khk3bTcwIHs2OQdAVUuYgAOgfvYeOqs"}'::jsonb,
    body := jsonb_build_object('time', now())
  );
  $$
);