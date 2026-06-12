-- Allow the circle creator to insert themselves as the first member.
-- The existing "admin can insert" policy requires a member row to already
-- exist, which is impossible for the very first insert.
CREATE POLICY "circle_members: creator can add self as admin"
  ON circle_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM circles
      WHERE id = circle_id
        AND created_by = auth.uid()
    )
  );
