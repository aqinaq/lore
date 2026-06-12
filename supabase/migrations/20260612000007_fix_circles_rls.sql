-- Allow a circle's creator to read it immediately after insert,
-- before the circle_members row exists.
CREATE POLICY "circles: creator can read own circle"
  ON circles FOR SELECT
  USING (auth.uid() = created_by);
