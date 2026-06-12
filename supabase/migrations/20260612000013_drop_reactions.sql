CREATE TABLE drop_reactions (
  drop_id    uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drop_id, user_id, emoji)
);

ALTER TABLE drop_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions: authenticated can read"
  ON drop_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "reactions: own user inserts"
  ON drop_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions: own user deletes"
  ON drop_reactions FOR DELETE
  USING (user_id = auth.uid());
