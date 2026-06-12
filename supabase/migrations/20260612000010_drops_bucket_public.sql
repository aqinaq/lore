-- Make drops bucket public so content_url can be a direct public URL
UPDATE storage.buckets SET public = true WHERE id = 'drops';

-- Replace old restrictive policies with simple auth-gated ones
DROP POLICY IF EXISTS "circle members can read drops" ON storage.objects;
DROP POLICY IF EXISTS "authors can upload drops" ON storage.objects;

CREATE POLICY "drops: authenticated can read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'drops' AND auth.uid() IS NOT NULL);

CREATE POLICY "drops: authenticated can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'drops' AND auth.uid() IS NOT NULL);

CREATE POLICY "drops: authors can delete own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'drops' AND auth.uid()::text = (storage.foldername(name))[2]);
