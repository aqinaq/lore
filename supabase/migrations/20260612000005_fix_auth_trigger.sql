-- Fix: replace pgcrypto digest() with built-in md5() so the trigger
-- doesn't fail when pgcrypto is installed in a different schema.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, display_name, email_hash)
  VALUES (
    NEW.id,
    '',
    md5(COALESCE(NEW.email, NEW.id::text))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
