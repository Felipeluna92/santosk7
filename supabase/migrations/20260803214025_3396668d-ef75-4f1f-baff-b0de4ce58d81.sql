ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_url text;

CREATE POLICY "media_anon_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'media');
CREATE POLICY "media_anon_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_anon_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'media') WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_anon_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'media');