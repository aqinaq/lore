-- Add reply count to drops
ALTER TABLE drops ADD COLUMN IF NOT EXISTS reply_count int NOT NULL DEFAULT 0;

-- Replies table
CREATE TABLE drop_replies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id    uuid        NOT NULL REFERENCES drops(id)   ON DELETE CASCADE,
  circle_id  uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  content    text        NOT NULL CHECK (length(content) >= 1 AND length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drop_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replies: members can read"
  ON drop_replies FOR SELECT
  USING (is_circle_member(circle_id));

CREATE POLICY "replies: members can insert own"
  ON drop_replies FOR INSERT
  WITH CHECK (author_id = auth.uid() AND is_circle_member(circle_id));

CREATE POLICY "replies: authors can delete own"
  ON drop_replies FOR DELETE
  USING (author_id = auth.uid());

-- Maintain reply_count automatically
CREATE OR REPLACE FUNCTION fn_inc_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE drops SET reply_count = reply_count + 1 WHERE id = NEW.drop_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_dec_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE drops SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.drop_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_reply_inserted
  AFTER INSERT ON drop_replies
  FOR EACH ROW EXECUTE FUNCTION fn_inc_reply_count();

CREATE TRIGGER trg_reply_deleted
  AFTER DELETE ON drop_replies
  FOR EACH ROW EXECUTE FUNCTION fn_dec_reply_count();
