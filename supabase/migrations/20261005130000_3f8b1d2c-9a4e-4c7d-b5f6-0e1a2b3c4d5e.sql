-- Agenda os jobs de automação (pg_cron + pg_net):
--   - sync-insights (A CADA HORA): coleta as métricas oficiais da Meta para
--     ig_media / account_daily_metrics. Sem este job, os insights do painel só
--     atualizavam quando o usuário clicava em "Sincronizar agora".
--   - publish-scheduled (A CADA 2 MIN): publica os posts agendados no calendário.
--   - monitor-accounts (A CADA 10 MIN): reafirma o monitoramento já existente.
-- O hook autentica com a chave pública do projeto (mesmo padrão da migration
-- 20260804054001; pg_net não consegue ler variáveis de ambiente do servidor).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sync-insights') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-insights');
SELECT cron.schedule(
  'sync-insights',
  '23 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://santosk7.lovable.app/api/public/hooks/sync-insights',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_zHAzT_U7k7UbKPQneJfuCg_97Srnhzf"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('publish-scheduled') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled');
SELECT cron.schedule(
  'publish-scheduled',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://santosk7.lovable.app/api/public/hooks/publish-scheduled',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_zHAzT_U7k7UbKPQneJfuCg_97Srnhzf"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

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
