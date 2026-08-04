CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.unschedule('monitor-accounts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-accounts');
SELECT cron.schedule(
  'monitor-accounts',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://santosk7.lovable.app/api/public/hooks/monitor-accounts',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_zHAzT_U7k7UbKPQneJfuCg_97Srnhzf"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);