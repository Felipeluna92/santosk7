
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  locale text NOT NULL DEFAULT 'pt-BR',
  meta_graph_version text NOT NULL DEFAULT 'v23.0',
  oauth_mode text NOT NULL DEFAULT 'instagram_login',
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_all" ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  display_name text,
  profile_picture_url text,
  account_type text,
  scopes text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_accounts TO anon, authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_all" ON public.instagram_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.account_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_tokens TO service_role;
ALTER TABLE public.account_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  media_type text NOT NULL DEFAULT 'IMAGE',
  public_url text NOT NULL,
  thumbnail_url text,
  tags text[] NOT NULL DEFAULT '{}',
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_items TO anon, authenticated;
GRANT ALL ON public.media_items TO service_role;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_all" ON public.media_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'POST',
  caption text,
  hashtags text,
  media_url text,
  carousel_urls text[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  meta_container_id text,
  meta_media_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO anon, authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_all" ON public.posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.logs TO anon, authenticated;
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_read" ON public.logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "logs_insert" ON public.logs FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER settings_touch BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER accounts_touch BEFORE UPDATE ON public.instagram_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER posts_touch BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tokens_touch BEFORE UPDATE ON public.account_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.settings (timezone, locale, meta_graph_version, oauth_mode, setup_completed)
VALUES ('America/Sao_Paulo', 'pt-BR', 'v23.0', 'instagram_login', false);

CREATE INDEX posts_status_idx ON public.posts(status);
CREATE INDEX posts_scheduled_idx ON public.posts(scheduled_at);
CREATE INDEX logs_created_idx ON public.logs(created_at DESC);
