-- ==============================================================
-- Migration: 20260414000012_trigger_auto_barbershop.sql
-- Descrição: CORREÇÃO DEFINITIVA — Criação automática de barbearia
--            via trigger no servidor, usando SECURITY DEFINER.
--            Resolve o problema de email confirmation (session=null)
--            que impedia o INSERT via client-side RLS.
-- ==============================================================

-- ── 1. Atualiza o trigger handle_new_user para salvar pro_type e barbearia_name ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, pro_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'pro_type', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    pro_type = EXCLUDED.pro_type;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. Trigger: criar barbearia automaticamente quando profile tem pro_type='barbearia' ──
CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- Dispara quando pro_type vira 'barbearia' (insert ou update)
  IF NEW.pro_type = 'barbearia' THEN
    -- Nome: tenta raw_user_meta_data->barbearia_name, fallback full_name
    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'barbearia_name'
       FROM auth.users WHERE id = NEW.id),
      NEW.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    -- Só cria se ainda não existir barbearia para este owner
    IF NOT EXISTS (
      SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id
    ) THEN
      INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
      VALUES (NEW.id, v_name, true, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
CREATE TRIGGER on_profile_barbearia
  AFTER INSERT OR UPDATE OF pro_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();


-- ── 3. Fix RLS SELECT público (anon + authenticated) ─────────────────────────
DROP POLICY IF EXISTS "barbershops_select_active"  ON public.barbershops;
DROP POLICY IF EXISTS "profiles_select_public"     ON public.profiles;

CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_active = true);


-- ── 4. Garante que anon role tem GRANT de SELECT nas tabelas ─────────────────
GRANT SELECT ON public.barbershops TO anon;
GRANT SELECT ON public.profiles    TO anon;


-- ── 5. Corrige usuários existentes: dispara o trigger manualmente ────────────
-- Garante que qualquer perfil já existente com pro_type='barbearia'
-- mas sem barbearia no banco tenha uma criada agora.
DO $$
DECLARE
  rec RECORD;
  v_name TEXT;
BEGIN
  FOR rec IN
    SELECT p.id, p.full_name, p.pro_type
    FROM public.profiles p
    WHERE p.pro_type = 'barbearia'
      AND NOT EXISTS (
        SELECT 1 FROM public.barbershops b WHERE b.owner_id = p.id
      )
  LOOP
    SELECT COALESCE(
      (SELECT u.raw_user_meta_data->>'barbearia_name'
       FROM auth.users u WHERE u.id = rec.id),
      rec.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
    VALUES (rec.id, v_name, true, false);
  END LOOP;
END;
$$;


-- ── 6. Garante que todas as barbearias existentes estão is_active=true ────────
UPDATE public.barbershops
SET is_active = true
WHERE is_active = false;
