DO $$
DECLARE
  owner_uuid uuid;
BEGIN
  SELECT id INTO owner_uuid FROM public.profiles WHERE username = 'santosk7' LIMIT 1;
  IF owner_uuid IS NULL THEN
    SELECT user_id INTO owner_uuid FROM public.app_owners ORDER BY created_at LIMIT 1;
  END IF;
  IF owner_uuid IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar o proprietário dos dados existentes';
  END IF;

  ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.account_tokens ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.media_items ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.account_alerts ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.account_daily_metrics ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.ig_media ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.media_snapshots ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE public.sync_executions ADD COLUMN IF NOT EXISTS user_id uuid;

  UPDATE public.instagram_accounts SET user_id = owner_uuid WHERE user_id IS NULL;
  UPDATE public.account_tokens t SET user_id = a.user_id FROM public.instagram_accounts a WHERE t.account_id = a.id AND t.user_id IS NULL;
  UPDATE public.posts p
  SET user_id = COALESCE(
    (SELECT a.user_id FROM public.instagram_accounts a WHERE a.id = p.account_id),
    owner_uuid
  )
  WHERE p.user_id IS NULL;
  UPDATE public.media_items SET user_id = owner_uuid WHERE user_id IS NULL;
  UPDATE public.logs SET user_id = owner_uuid WHERE user_id IS NULL;
  UPDATE public.settings SET user_id = owner_uuid WHERE user_id IS NULL;
  UPDATE public.push_subscriptions SET user_id = owner_uuid WHERE user_id IS NULL;
  UPDATE public.account_alerts aa SET user_id = a.user_id FROM public.instagram_accounts a WHERE aa.account_id = a.id AND aa.user_id IS NULL;
  UPDATE public.account_daily_metrics m SET user_id = a.user_id FROM public.instagram_accounts a WHERE m.account_id = a.id AND m.user_id IS NULL;
  UPDATE public.ig_media m SET user_id = a.user_id FROM public.instagram_accounts a WHERE m.account_id = a.id AND m.user_id IS NULL;
  UPDATE public.media_snapshots s SET user_id = m.user_id FROM public.ig_media m WHERE s.media_row_id = m.id AND s.user_id IS NULL;
  UPDATE public.sync_executions SET user_id = owner_uuid WHERE user_id IS NULL;
END $$;

ALTER TABLE public.instagram_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.account_tokens ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.posts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.media_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.account_alerts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.account_daily_metrics ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.ig_media ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.media_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.sync_executions ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.instagram_accounts ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.posts ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.media_items ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.logs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.settings ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.instagram_accounts DROP CONSTRAINT IF EXISTS instagram_accounts_instagram_user_id_key;
ALTER TABLE public.instagram_accounts ADD CONSTRAINT instagram_accounts_user_instagram_key UNIQUE (user_id, instagram_user_id);
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint);
ALTER TABLE public.settings ADD CONSTRAINT settings_user_key UNIQUE (user_id);

CREATE INDEX IF NOT EXISTS instagram_accounts_user_idx ON public.instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS posts_user_idx ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS media_items_user_idx ON public.media_items(user_id);
CREATE INDEX IF NOT EXISTS logs_user_created_idx ON public.logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_tokens_user_idx ON public.account_tokens(user_id);
CREATE INDEX IF NOT EXISTS account_alerts_user_idx ON public.account_alerts(user_id);
CREATE INDEX IF NOT EXISTS account_daily_metrics_user_idx ON public.account_daily_metrics(user_id);
CREATE INDEX IF NOT EXISTS ig_media_user_idx ON public.ig_media(user_id);
CREATE INDEX IF NOT EXISTS media_snapshots_user_idx ON public.media_snapshots(user_id);
CREATE INDEX IF NOT EXISTS sync_executions_user_idx ON public.sync_executions(user_id);

CREATE OR REPLACE FUNCTION public.validate_workspace_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE related_owner uuid;
BEGIN
  IF TG_TABLE_NAME IN ('account_tokens', 'posts', 'account_alerts', 'account_daily_metrics', 'ig_media') AND NEW.account_id IS NOT NULL THEN
    SELECT user_id INTO related_owner FROM public.instagram_accounts WHERE id = NEW.account_id;
    IF related_owner IS NULL OR related_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'A conta selecionada não pertence a este usuário';
    END IF;
  ELSIF TG_TABLE_NAME = 'media_snapshots' THEN
    SELECT user_id INTO related_owner FROM public.ig_media WHERE id = NEW.media_row_id;
    IF related_owner IS NULL OR related_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'A mídia selecionada não pertence a este usuário';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_tokens_workspace_guard ON public.account_tokens;
CREATE TRIGGER account_tokens_workspace_guard BEFORE INSERT OR UPDATE ON public.account_tokens FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();
DROP TRIGGER IF EXISTS posts_workspace_guard ON public.posts;
CREATE TRIGGER posts_workspace_guard BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();
DROP TRIGGER IF EXISTS account_alerts_workspace_guard ON public.account_alerts;
CREATE TRIGGER account_alerts_workspace_guard BEFORE INSERT OR UPDATE ON public.account_alerts FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();
DROP TRIGGER IF EXISTS account_daily_metrics_workspace_guard ON public.account_daily_metrics;
CREATE TRIGGER account_daily_metrics_workspace_guard BEFORE INSERT OR UPDATE ON public.account_daily_metrics FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();
DROP TRIGGER IF EXISTS ig_media_workspace_guard ON public.ig_media;
CREATE TRIGGER ig_media_workspace_guard BEFORE INSERT OR UPDATE ON public.ig_media FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();
DROP TRIGGER IF EXISTS media_snapshots_workspace_guard ON public.media_snapshots;
CREATE TRIGGER media_snapshots_workspace_guard BEFORE INSERT OR UPDATE ON public.media_snapshots FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_ownership();

DROP POLICY IF EXISTS accounts_owner ON public.instagram_accounts;
DROP POLICY IF EXISTS posts_owner ON public.posts;
DROP POLICY IF EXISTS media_owner ON public.media_items;
DROP POLICY IF EXISTS settings_owner ON public.settings;
DROP POLICY IF EXISTS logs_owner_read ON public.logs;
DROP POLICY IF EXISTS push_subscriptions_owner ON public.push_subscriptions;
DROP POLICY IF EXISTS account_alerts_owner ON public.account_alerts;
DROP POLICY IF EXISTS account_daily_metrics_owner ON public.account_daily_metrics;
DROP POLICY IF EXISTS ig_media_owner ON public.ig_media;
DROP POLICY IF EXISTS media_snapshots_owner ON public.media_snapshots;
DROP POLICY IF EXISTS sync_executions_owner ON public.sync_executions;

CREATE POLICY accounts_user_isolation ON public.instagram_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_user_isolation ON public.posts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY media_items_user_isolation ON public.media_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY settings_user_isolation ON public.settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY logs_user_read ON public.logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY push_subscriptions_user_isolation ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY account_alerts_user_isolation ON public.account_alerts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY account_daily_metrics_user_isolation ON public.account_daily_metrics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ig_media_user_isolation ON public.ig_media FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY media_snapshots_user_isolation ON public.media_snapshots FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY sync_executions_user_isolation ON public.sync_executions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS media_owner_read ON storage.objects;
DROP POLICY IF EXISTS media_owner_insert ON storage.objects;
DROP POLICY IF EXISTS media_owner_update ON storage.objects;
DROP POLICY IF EXISTS media_owner_delete ON storage.objects;
CREATE POLICY media_user_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY media_user_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY media_user_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY media_user_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP FUNCTION IF EXISTS public.claim_app_ownership();
DROP FUNCTION IF EXISTS public.is_app_owner(uuid);