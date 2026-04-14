-- ==============================================================
-- Migration: 20260414000010_barbershops_anon_select.sql
-- Descrição: Garante que usuários anônimos (não autenticados)
--            também possam buscar barbearias ativas.
--            Necessário para o SearchWidget e cards da home
--            funcionarem sem login.
-- ==============================================================

-- Remove política antiga se existir (pode ter sido criada com TO authenticated only)
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;

-- Recria como SELECT público para qualquer role (anon + authenticated)
CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
