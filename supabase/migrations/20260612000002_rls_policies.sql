-- Helper: returns true if the current auth user is a member of p_circle_id
CREATE OR REPLACE FUNCTION is_circle_member(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = auth.uid()
  );
$$;

-- Helper: returns true if the current auth user is an admin of p_circle_id
CREATE OR REPLACE FUNCTION is_circle_admin(p_circle_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = auth.uid()
      AND role      = 'admin'
  );
$$;

-- ─── users ────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: read own row"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: update own row"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users: insert own row"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── circles ──────────────────────────────────────────────────────────────────
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circles: members can read"
  ON circles FOR SELECT
  USING (is_circle_member(id));

CREATE POLICY "circles: creator can insert"
  ON circles FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "circles: admin can update"
  ON circles FOR UPDATE
  USING (is_circle_admin(id))
  WITH CHECK (is_circle_admin(id));

CREATE POLICY "circles: admin can delete"
  ON circles FOR DELETE
  USING (is_circle_admin(id));

-- ─── circle_members ───────────────────────────────────────────────────────────
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circle_members: members can read"
  ON circle_members FOR SELECT
  USING (is_circle_member(circle_id));

CREATE POLICY "circle_members: admin can insert"
  ON circle_members FOR INSERT
  WITH CHECK (is_circle_admin(circle_id));

CREATE POLICY "circle_members: admin can delete others, self can leave"
  ON circle_members FOR DELETE
  USING (is_circle_admin(circle_id) OR auth.uid() = user_id);

CREATE POLICY "circle_members: admin can update role"
  ON circle_members FOR UPDATE
  USING (is_circle_admin(circle_id))
  WITH CHECK (is_circle_admin(circle_id));

-- ─── drops ────────────────────────────────────────────────────────────────────
ALTER TABLE drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drops: members can read"
  ON drops FOR SELECT
  USING (is_circle_member(circle_id));

CREATE POLICY "drops: members can insert own drops"
  ON drops FOR INSERT
  WITH CHECK (
    is_circle_member(circle_id)
    AND auth.uid() = author_id
  );

CREATE POLICY "drops: author or admin can update"
  ON drops FOR UPDATE
  USING (auth.uid() = author_id OR is_circle_admin(circle_id))
  WITH CHECK (auth.uid() = author_id OR is_circle_admin(circle_id));

CREATE POLICY "drops: author or admin can delete"
  ON drops FOR DELETE
  USING (auth.uid() = author_id OR is_circle_admin(circle_id));

-- ─── vault_pins ───────────────────────────────────────────────────────────────
ALTER TABLE vault_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_pins: members can read"
  ON vault_pins FOR SELECT
  USING (is_circle_member(circle_id));

CREATE POLICY "vault_pins: members can pin"
  ON vault_pins FOR INSERT
  WITH CHECK (
    is_circle_member(circle_id)
    AND auth.uid() = pinned_by
  );

CREATE POLICY "vault_pins: pinner or admin can delete"
  ON vault_pins FOR DELETE
  USING (auth.uid() = pinned_by OR is_circle_admin(circle_id));

-- ─── play_sessions ────────────────────────────────────────────────────────────
ALTER TABLE play_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "play_sessions: members can read"
  ON play_sessions FOR SELECT
  USING (is_circle_member(circle_id));

CREATE POLICY "play_sessions: members can start sessions"
  ON play_sessions FOR INSERT
  WITH CHECK (
    is_circle_member(circle_id)
    AND auth.uid() = started_by
  );

CREATE POLICY "play_sessions: starter or admin can update"
  ON play_sessions FOR UPDATE
  USING (auth.uid() = started_by OR is_circle_admin(circle_id))
  WITH CHECK (auth.uid() = started_by OR is_circle_admin(circle_id));
