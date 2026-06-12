-- Create the drops storage bucket (private, 50 MB per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drops',
  'drops',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- File path structure: drops/{circle_id}/{author_id}/{filename}
CREATE POLICY "Circle members can read drop files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'drops'
    AND is_circle_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Circle members can upload their own drop files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'drops'
    AND is_circle_member((storage.foldername(name))[1]::uuid)
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

CREATE POLICY "Authors can delete their own drop files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'drops'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
