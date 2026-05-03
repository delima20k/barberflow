-- ==============================================================
-- Migration: 20260503000001_profiles_email.sql
-- Descrição: Adiciona coluna email à tabela profiles,
--            sincronizada automaticamente com auth.users.
--            Permite busca de usuários por nome OU email.
-- ==============================================================

-- 1. Adiciona coluna email
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Retroalimenta registros existentes com o email de auth.users
UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  p.id = u.id;

-- 3. Índice para busca rápida por email (ilike)
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

-- 4. Atualiza a função do trigger de criação para copiar email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 5. Função para sincronizar email quando o usuário altera o e-mail no Auth
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    email = NEW.email
  WHERE  id = NEW.id;
  RETURN NEW;
END;
$$;

-- 6. Trigger de atualização de email
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();
