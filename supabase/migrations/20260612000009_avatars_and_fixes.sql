-- 1. Circle avatars column
ALTER TABLE circles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Public avatars bucket (circle + user profile pictures)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users can update own avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3. Allow any authenticated user to read other users' basic profiles
--    (needed so the drops feed can show author names)
CREATE POLICY "users: authenticated can read all profiles"
  ON users FOR SELECT
  USING (auth.uid() IS NOT NULL);
