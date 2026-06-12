-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text        NOT NULL,
  email_hash     text        NOT NULL UNIQUE,
  avatar_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  current_vibe   text,
  vibe_set_at    timestamptz
);

-- ─── circles ──────────────────────────────────────────────────────────────────
CREATE TABLE circles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  invite_code    text        NOT NULL UNIQUE,
  invite_expires timestamptz NOT NULL,
  created_by     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  member_count   int         NOT NULL DEFAULT 0 CHECK (member_count >= 0 AND member_count <= 20)
);

-- ─── circle_members ───────────────────────────────────────────────────────────
CREATE TABLE circle_members (
  circle_id  uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  nickname   text,
  PRIMARY KEY (circle_id, user_id)
);

-- ─── drops ────────────────────────────────────────────────────────────────────
CREATE TABLE drops (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  type        text        NOT NULL CHECK (type IN ('photo', 'voice', 'drawing', 'text')),
  content_url text,
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  is_pinned   boolean     NOT NULL DEFAULT false
);

-- ─── vault_pins ───────────────────────────────────────────────────────────────
CREATE TABLE vault_pins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id      uuid        NOT NULL REFERENCES drops(id)   ON DELETE CASCADE,
  circle_id    uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  pinned_by    uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  memory_title text,
  pinned_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── play_sessions ────────────────────────────────────────────────────────────
CREATE TABLE play_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('listen', 'draw', 'poll', 'question')),
  started_by uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  state      text        NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'ended')),
  metadata   jsonb       NOT NULL DEFAULT '{}'
);
