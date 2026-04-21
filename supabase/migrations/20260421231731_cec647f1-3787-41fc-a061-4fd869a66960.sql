-- Reschedule generate-recurring-invoices-hourly to use vault.decrypted_secrets
-- instead of a hardcoded anon key (consistent with all other crons).
SELECT cron.unschedule('generate-recurring-invoices-hourly');

SELECT cron.schedule(
  'generate-recurring-invoices-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/generate-recurring-invoices',
    headers := (SELECT jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || decrypted_secret
    ) FROM vault.decrypted_secrets WHERE name = 'edge_anon_key'),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);