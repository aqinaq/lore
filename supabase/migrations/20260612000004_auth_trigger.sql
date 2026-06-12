-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
-- display_name starts empty; the onboarding setup screen fills it in.
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
    encode(
      digest(COALESCE(NEW.email, NEW.id::text), 'sha256'),
      'hex'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();
