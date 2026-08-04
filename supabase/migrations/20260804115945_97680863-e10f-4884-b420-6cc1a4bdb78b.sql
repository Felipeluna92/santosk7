
CREATE TABLE public.ig_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  ig_media_id text NOT NULL,
  media_product_type text,
  media_type text,
  format text NOT NULL DEFAULT 'POST',
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  permalink text,
  thumbnail_url text,
  media_url text,
  duration_seconds numeric,
  published_at timestamptz,
  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saved bigint,
  total_interactions bigint,
  unavailable_metrics text[] NOT NULL DEFAULT '{}',
  api_version text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ig_media_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_media TO authenticated;
GRANT ALL ON public.ig_media TO service_role;
ALTER TABLE public.ig_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY ig_media_owner ON public.ig_media FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE TRIGGER ig_media_touch BEFORE UPDATE ON public.ig_media
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX ig_media_account_pub_idx ON public.ig_media (account_id, published_at DESC);

CREATE TABLE public.media_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_row_id uuid NOT NULL REFERENCES public.ig_media(id) ON DELETE CASCADE,
  window_label text NOT NULL,
  age_hours numeric NOT NULL,
  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saved bigint,
  total_interactions bigint,
  unavailable_metrics text[] NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_row_id, window_label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_snapshots TO authenticated;
GRANT ALL ON public.media_snapshots TO service_role;
ALTER TABLE public.media_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_snapshots_owner ON public.media_snapshots FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));

CREATE TABLE public.account_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  day date NOT NULL,
  followers bigint,
  views bigint,
  reach bigint,
  profile_views bigint,
  unavailable_metrics text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_daily_metrics TO authenticated;
GRANT ALL ON public.account_daily_metrics TO service_role;
ALTER TABLE public.account_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_daily_metrics_owner ON public.account_daily_metrics FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));

CREATE TABLE public.sync_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'insights',
  status text NOT NULL DEFAULT 'running',
  accounts_processed int NOT NULL DEFAULT 0,
  media_upserted int NOT NULL DEFAULT 0,
  snapshots_written int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_executions TO authenticated;
GRANT ALL ON public.sync_executions TO service_role;
ALTER TABLE public.sync_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_executions_owner ON public.sync_executions FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
