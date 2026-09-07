CREATE TABLE public.media_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO authenticated;
GRANT ALL ON public.media_folders TO service_role;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_folders_user_isolation ON public.media_folders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.media_items ADD COLUMN folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL;

CREATE TABLE public.caption_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caption_templates TO authenticated;
GRANT ALL ON public.caption_templates TO service_role;
ALTER TABLE public.caption_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY caption_templates_user_isolation ON public.caption_templates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER caption_templates_touch BEFORE UPDATE ON public.caption_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();