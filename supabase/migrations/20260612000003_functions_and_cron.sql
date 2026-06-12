-- ─── Trigger: enforce expires_at = created_at + 7 days on drop insert ─────────
CREATE OR REPLACE FUNCTION enforce_drop_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.expires_at := NEW.created_at + interval '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER drops_enforce_expiry
  BEFORE INSERT ON drops
  FOR EACH ROW
  EXECUTE FUNCTION enforce_drop_expiry();

-- ─── pg_cron: null current_vibe daily at midnight UTC ─────────────────────────
-- pg_cron is available on Supabase Pro; enable via Dashboard > Database > Extensions
-- or uncomment the line below if running migrations directly:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'null-vibes-midnight',   -- job name (idempotent)
  '0 0 * * *',             -- every day at 00:00 UTC
  $$
    UPDATE users
    SET current_vibe = NULL,
        vibe_set_at  = NULL
    WHERE current_vibe IS NOT NULL;
  $$
);
