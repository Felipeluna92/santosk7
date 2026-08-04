-- Owner allowlist
CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_owners TO authenticated;
GRANT ALL ON public.app_owners TO service_role;
ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_owners_self_read ON public.app_owners;
CREATE POLICY app_owners_self_read ON public.app_owners
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_app_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.app_owners WHERE user_id = _user_id);
$$;

-- First authenticated user claims the workspace
CREATE OR REPLACE FUNCTION public.claim_app_ownership()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.app_owners) THEN
    RETURN EXISTS (SELECT 1 FROM public.app_owners WHERE user_id = uid);
  END IF;
  INSERT INTO public.app_owners (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_app_ownership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_app_ownership() TO authenticated;
REVOKE ALL ON FUNCTION public.is_app_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner(uuid) TO authenticated;

-- Replace permissive policies
DROP POLICY IF EXISTS accounts_all ON public.instagram_accounts;
DROP POLICY IF EXISTS posts_all ON public.posts;
DROP POLICY IF EXISTS media_all ON public.media_items;
DROP POLICY IF EXISTS settings_all ON public.settings;
DROP POLICY IF EXISTS logs_read ON public.logs;
DROP POLICY IF EXISTS logs_insert ON public.logs;

CREATE POLICY accounts_owner ON public.instagram_accounts FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE POLICY posts_owner ON public.posts FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE POLICY media_owner ON public.media_items FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE POLICY settings_owner ON public.settings FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid())) WITH CHECK (public.is_app_owner(auth.uid()));
CREATE POLICY logs_owner_read ON public.logs FOR SELECT TO authenticated
  USING (public.is_app_owner(auth.uid()));

REVOKE ALL ON public.instagram_accounts FROM anon;
REVOKE ALL ON public.posts FROM anon;
REVOKE ALL ON public.media_items FROM anon;
REVOKE ALL ON public.settings FROM anon;
REVOKE ALL ON public.logs FROM anon;
REVOKE ALL ON public.account_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;

-- Storage: media bucket restricted to the owner
DROP POLICY IF EXISTS media_anon_read ON storage.objects;
DROP POLICY IF EXISTS media_anon_insert ON storage.objects;
DROP POLICY IF EXISTS media_anon_update ON storage.objects;
DROP POLICY IF EXISTS media_anon_delete ON storage.objects;
CREATE POLICY media_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.is_app_owner(auth.uid()));
CREATE POLICY media_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.is_app_owner(auth.uid()));
CREATE POLICY media_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.is_app_owner(auth.uid()))
  WITH CHECK (bucket_id = 'media' AND public.is_app_owner(auth.uid()));
CREATE POLICY media_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.is_app_owner(auth.uid()));