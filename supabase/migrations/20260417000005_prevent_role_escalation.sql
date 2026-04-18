-- ==============================================================
-- Migration: 20260417000005_prevent_role_escalation.sql
-- Descrição: CRÍTICO — Impede que usuários alterem o próprio
--            `role` ou `pro_type` via UPDATE direto na API.
--
-- Vulnerabilidade corrigida:
--   A policy profiles_update_own (auth.uid() = id) permitia que
--   qualquer usuário fizesse PATCH /profiles?id=eq.{uuid} com
--   {"role":"admin"} e promovesse a si mesmo.
--   O mesmo vale para pro_type: cliente podia virar 'barbearia'
--   e triggear criação automática de barbearia.
--
-- Solução: trigger BEFORE UPDATE que rejeita mudanças de role
--   e pro_type exceto quando executado pelo service_role.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permite mudanças pelo service_role (admin, triggers internos)
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bloqueia qualquer tentativa de alterar role ou pro_type pelo próprio usuário
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'O campo role não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
    RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se já existir
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();


-- ==============================================================
-- BÔNUS: Restringe profiles_insert_own para aceitar apenas
-- role 'client' ou 'professional' — nunca 'admin' via cadastro.
-- O trigger handle_new_user (SECURITY DEFINER) pode inserir
-- 'admin' pois roda como service_role internamente.
-- Usuários normais são bloqueados pelo WITH CHECK abaixo.
-- ==============================================================

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role IN ('client', 'professional')
  );
