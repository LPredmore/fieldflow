-- Reschedule sms-job-reminders-hourly to read auth from vault
-- (matches the pattern used by sms-crew-reminders and other workers)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sms-job-reminders-hourly') THEN
    PERFORM cron.unschedule('sms-job-reminders-hourly');
  END IF;
END$$;

SELECT cron.schedule(
  'sms-job-reminders-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/sms-job-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_anon_key')
    ),
    body := jsonb_build_object('time', now())
  );
  $cron$
);