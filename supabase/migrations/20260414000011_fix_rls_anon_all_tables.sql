-- ==============================================================
-- Migration: 20260414000011_fix_rls_anon_all_tables.sql
-- Descrição: Garante que usuários ANÔNIMOS (não logados) possam
--            buscar barbearias, perfis e professionals.
--            Corrige problema de cards/pesquisa não aparecerem.
-- ==============================================================

-- ── BARBERSHOPS: SELECT público para anon e authenticated ─────
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;

CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ── PROFILES: SELECT público para anon e authenticated ────────
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ── PROFESSIONALS: SELECT público para anon e authenticated ───
DROP POLICY IF EXISTS "professionals_select_active" ON public.professionals;

CREATE POLICY "professionals_select_active"
  ON public.professionals FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ── DIAGNÓSTICO: Ver todas as barbearias existentes ────────────
-- (execute separadamente para verificar os dados)
-- SELECT id, owner_id, name, is_active, is_open, created_at
-- FROM public.barbershops
-- ORDER BY created_at DESC;

-- ── DIAGNÓSTICO: Corrigir barbearias com is_active = false ────
-- Se alguma barbearia aparecer com is_active=false, rode:
-- UPDATE public.barbershops SET is_active = true WHERE is_active = false;
