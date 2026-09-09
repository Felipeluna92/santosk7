CREATE TABLE public.post_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'instagram',
  type text NOT NULL DEFAULT 'POST',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  caption text,
  caption_variants text[] NOT NULL DEFAULT '{}',
  hashtags text,
  media_url text,
  cover_url text,
  carousel_urls text[] NOT NULL DEFAULT '{}',
  default_time text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_presets TO authenticated;
GRANT ALL ON public.post_presets TO service_role;

ALTER TABLE public.post_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_presets_user_isolation ON public.post_presets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER post_presets_touch_updated_at
  BEFORE UPDATE ON public.post_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();